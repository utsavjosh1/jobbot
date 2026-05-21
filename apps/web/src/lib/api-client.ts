import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
  timeout: 30000, // 30s timeout — accounts for ~300ms RTT to Dallas VPS
  headers: {
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate, br",
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.assign("/login");
      console.warn("401 Unauthorized - Token removed");
    }
    return Promise.reject(error);
  },
);

export default apiClient;
