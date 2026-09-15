
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './state';
import Landing from './pages/Landing';
import Login from './pages/Login';
import OtpLogin from './pages/OtpLogin';
import Signup from './pages/Signup';
import Register from './pages/Register';
import SignupForm from './pages/SignupForm';
import VerifyOtp from './pages/VerifyOtp';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AppShell from './pages/AppShell';
import Home from './pages/Home';
import PostShift from './pages/manager/PostShift';
import DispatchDesk from './pages/manager/DispatchDesk';
import WorkerFeed from './pages/worker/WorkerFeed';
import MyWork from './pages/worker/MyWork';
import ShiftDetail from './pages/ShiftDetail';
import History from './pages/History';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import Payments from './pages/Payments';
import Chat from './pages/Chat';
import Verification from './pages/Verification';
import AdminLogin from './pages/admin/AdminLogin';
import AdminHome from './pages/admin/AdminHome';

function RequireAuth({ children }) {
  const { user, booted } = useAuth();
  if (!booted) return <div className="boot-spinner">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminGate({ children }) {
  return <Navigate to="/tail/z7k9x2/admin" replace />;
}

export default function App() {
  const { user } = useAuth();
  const loc = useLocation();

  if ((user && user.role === 'admin') && !loc.pathname.startsWith('/tail')) {
    return <Navigate to="/tail/z7k9x2/admin/home" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<Register />} />
      <Route path="/signup/pick" element={<Signup />} />
      <Route path="/signup/:role" element={<SignupForm />} />
      <Route path="/verify" element={<VerifyOtp />} />
      <Route path="/login" element={<OtpLogin />} />
      <Route path="/login/password" element={<Login />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />

      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="post" element={<PostShift />} />
        <Route path="manage" element={<DispatchDesk />} />
        <Route path="browse" element={<WorkerFeed />} />
        <Route path="my" element={<MyWork />} />
        <Route path="shifts/:id" element={<ShiftDetail />} />
        <Route path="history" element={<History />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
        <Route path="payments" element={<Payments />} />
        <Route path="chat" element={<Chat />} />
        <Route path="verification" element={<Verification />} />
      </Route>

      <Route path="/tail/z7k9x2/admin" element={<AdminLogin />} />
      <Route path="/tail/z7k9x2/admin/home" element={<AdminHome />} />

      <Route path="*" element={<UserMismatch />} />
    </Routes>
  );
}

function UserMismatch() {
  const { user } = useAuth();
  if (user && user.role === 'manager') return <Navigate to="/app" replace />;
  if (user) return <Navigate to="/app" replace />;
  return <Navigate to="/" replace />;
}