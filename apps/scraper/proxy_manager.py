"""
Proxy Manager for Postly Scraper.
Manages a pool of proxies with health tracking, auto-fetching, and round-robin rotation.
Extracted and simplified from the original run_scraper.py for Postly integration.
"""

import json
import logging
import random
import time
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger("PostlyScraper.Proxy")

# Known-good test endpoints
TEST_TARGETS = [
    "https://www.google.com",
    "https://httpbin.org/ip",
    "https://www.indeed.com",
]

# Free proxy sources (public)
PROXY_SOURCES = [
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all",
    "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
    "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
    "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
    "https://raw.githubusercontent.com/0xPugazh/Free-Proxies/main/http.txt",
    "https://raw.githubusercontent.com/officialputuid/KangProxy/KangProxy/http/http.txt",
    "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt",
    "https://raw.githubusercontent.com/Anonym0usWork1221/Free-Proxies/main/proxy.txt",
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=https&timeout=5000&country=all&ssl=all&anonymity=all",
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=5000&country=all&ssl=all&anonymity=all",
    "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=5000&country=all&ssl=all&anonymity=all",
]


class ProxyManager:
    """High-quality proxy pool with health tracking and auto-fetching."""

    def __init__(self, cfg_proxies: dict):
        self.cfg = cfg_proxies
        self.method = cfg_proxies.get("method", "both")
        self.pool: list[str] = []
        self.blacklist: set[str] = set()
        self.health: dict[str, dict] = {}
        self.last_refresh = 0.0
        self.refresh_interval = cfg_proxies.get("auto_fetch", {}).get(
            "refresh_interval", 1800
        )
        self.max_proxies = cfg_proxies.get("auto_fetch", {}).get("max_proxies", 80)
        self.test_timeout = cfg_proxies.get("auto_fetch", {}).get("test_timeout", 5)
        self.site_ban: dict[str, dict[str, float]] = defaultdict(dict)

        self._load_initial()

    def _normalize(self, proxy: str) -> Optional[str]:
        proxy = proxy.strip().rstrip("\r")
        if not proxy:
            return None
        if proxy.startswith(("http://", "https://", "socks")):
            return proxy
        if ":" in proxy:
            return f"http://{proxy}"
        return proxy

    def _load_from_file(self) -> list[str]:
        file_path = Path(self.cfg.get("file_path", "proxies.txt"))
        if not file_path.exists():
            return []
        proxies = []
        with open(file_path, "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    p = self._normalize(line)
                    if p:
                        proxies.append(p)
        return proxies

    def _fetch_from_url(self, url: str) -> list[str]:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read().decode("utf-8", errors="ignore").strip()
            try:
                parsed = json.loads(data)
                if isinstance(parsed, list):
                    items = parsed
                elif isinstance(parsed, dict):
                    items = parsed.get("data", parsed.get("proxies", []))
                else:
                    items = []
                return [
                    self._normalize(str(p.get("proxy", p)))
                    for p in items
                    if isinstance(p, (str, dict))
                ]
            except (json.JSONDecodeError, TypeError):
                pass
            lines = [l.strip() for l in data.split("\n") if l.strip()]
            return [
                self._normalize(l)
                for l in lines
                if l and not l.startswith("<") and not l.startswith("<!")
            ]
        except Exception as e:
            logger.debug("Fetch failed for %s: %s", url[:60], e)
            return []

    def _fetch_all_sources(self) -> list[str]:
        logger.info("Fetching proxies from public sources...")
        all_proxies = []
        configured = self.cfg.get("auto_fetch", {}).get("sources", [])
        sources = configured if configured else PROXY_SOURCES
        for url in sources:
            try:
                fetched = self._fetch_from_url(url)
                valid = [p for p in fetched if p is not None]
                all_proxies.extend(valid)
            except Exception as e:
                logger.debug("Source error: %s", e)
        return all_proxies

    def _load_initial(self):
        raw = []
        if self.method in ("file", "both"):
            raw.extend(self._load_from_file())
        if self.method in ("auto", "both") and self.cfg.get("auto_fetch", {}).get(
            "enabled", True
        ):
            raw.extend(self._fetch_all_sources())

        seen = set()
        valid = [p for p in raw if p and p not in seen and not seen.add(p)]
        self.pool = valid[: self.max_proxies]
        self.last_refresh = time.time()

        for p in self.pool:
            self.health.setdefault(p, {"success": 0, "fail": 0, "last_used": 0})

        logger.info("Proxy pool ready: %d proxies", len(self.pool))

    def record_success(self, proxy: str, site: str = None):
        if proxy in self.health:
            self.health[proxy]["success"] += 1
            self.health[proxy]["last_used"] = time.time()

    def record_failure(self, proxy: str, site: str = None):
        if proxy in self.health:
            self.health[proxy]["fail"] += 1
            h = self.health[proxy]
            total = h["success"] + h["fail"]
            if total >= 3 and h["fail"] / total > 0.8:
                self._remove(proxy)
        if site and proxy:
            self.site_ban[site][proxy] = time.time() + 300

    def _remove(self, proxy: str):
        if proxy in self.pool:
            self.pool.remove(proxy)
        self.health.pop(proxy, None)
        self.blacklist.add(proxy)

    def get_site_proxies(self, site: str) -> list[str]:
        now = time.time()
        valid = [
            p
            for p in self.pool
            if self.site_ban.get(site, {}).get(p, 0) <= now
            and p not in self.blacklist
        ]
        random.shuffle(valid)
        return valid

    def ensure_fresh(self):
        if self.method in ("auto", "both") and self.cfg.get("auto_fetch", {}).get(
            "enabled", True
        ):
            now = time.time()
            if now - self.last_refresh > self.refresh_interval:
                logger.info("Refreshing proxy pool...")
                fresh = self._fetch_all_sources()
                combined = list(dict.fromkeys(self.pool + fresh))
                self.pool = combined[: self.max_proxies]
                for p in self.pool:
                    self.health.setdefault(p, {"success": 0, "fail": 0, "last_used": 0})
                self.last_refresh = now
                logger.info("Proxy pool refreshed: %d proxies", len(self.pool))

    def has_proxies(self) -> bool:
        self.ensure_fresh()
        return len(self.pool) > 0
