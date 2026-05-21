import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PageLoader } from "./components/ui/PageLoader";
import { ToastContainer } from "./components/ui/Toast";
import "./styles/transmission.css";

const TransmissionHome = lazy(() =>
  import("@pages/TransmissionHome").then((m) => ({
    default: m.TransmissionHome,
  })),
);
const DocsView = lazy(() =>
  import("./pages/DocsView").then((m) => ({
    default: m.DocsView,
  })),
);
const TransmissionRoleSelector = lazy(() =>
  import("@pages/TransmissionRoleSelector").then((m) => ({
    default: m.TransmissionRoleSelector,
  })),
);
const TransmissionLogin = lazy(() =>
  import("@pages/TransmissionLogin").then((m) => ({
    default: m.TransmissionLogin,
  })),
);
const TransmissionRegister = lazy(() =>
  import("@pages/TransmissionRegister").then((m) => ({
    default: m.TransmissionRegister,
  })),
);
const VerifyOtpPage = lazy(() =>
  import("./pages/VerifyOtpPage").then((m) => ({
    default: m.VerifyOtpPage,
  })),
);

const TransmissionPricing = lazy(() =>
  import("@pages/TransmissionPricing").then((m) => ({
    default: m.TransmissionPricing,
  })),
);
const TransmissionChat = lazy(() =>
  import("@pages/TransmissionChat").then((m) => ({
    default: m.TransmissionChat,
  })),
);
const TransmissionIntegrations = lazy(() =>
  import("@pages/TransmissionIntegrations").then((m) => ({
    default: m.TransmissionIntegrations,
  })),
);
const TransmissionSettings = lazy(() =>
  import("@pages/TransmissionSettings").then((m) => ({
    default: m.TransmissionSettings,
  })),
);
const TransmissionNotFound = lazy(() =>
  import("@pages/TransmissionNotFound").then((m) => ({
    default: m.TransmissionNotFound,
  })),
);

const ForgotPasswordPage = lazy(() =>
  import("./pages/ForgotPasswordPage").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const AuthCallbackPage = lazy(() =>
  import("@pages/AuthCallbackPage").then((m) => ({
    default: m.AuthCallbackPage,
  })),
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ─── Public ──────────────────────────────────── */}
          <Route path="/" element={<TransmissionHome />} />
          <Route path="join" element={<TransmissionRoleSelector />} />
          <Route path="login" element={<TransmissionLogin />} />
          <Route path="register" element={<TransmissionRegister />} />
          <Route path="verify-otp" element={<VerifyOtpPage />} />

          <Route path="pricing" element={<TransmissionPricing />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="login/callback" element={<AuthCallbackPage />} />
          <Route path="docs" element={<DocsView />} />

          {/* ─── Protected ───────────────────────────────── */}
          <Route
            path="chat"
            element={
              <ProtectedRoute>
                <TransmissionChat />
              </ProtectedRoute>
            }
          />
          <Route
            path="chat/:id"
            element={
              <ProtectedRoute>
                <TransmissionChat />
              </ProtectedRoute>
            }
          />
          <Route
            path="integrations"
            element={
              <ProtectedRoute>
                <TransmissionIntegrations />
              </ProtectedRoute>
            }
          />
          <Route
            path="settings"
            element={
              <ProtectedRoute>
                <TransmissionSettings />
              </ProtectedRoute>
            }
          />

          {/* ─── 404 ─────────────────────────────────────── */}
          <Route path="*" element={<TransmissionNotFound />} />
        </Routes>
      </Suspense>
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
