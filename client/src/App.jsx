import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './state';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import SignupForm from './pages/SignupForm';
import VerifyOtp from './pages/VerifyOtp';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AppShell from './pages/AppShell';
import Home from './pages/Home';
import PostShift from './pages/manager/PostShift';
import Manage from './pages/manager/Manage';
import Browse from './pages/worker/Browse';
import MyWork from './pages/worker/MyWork';
import ShiftDetail from './pages/ShiftDetail';
import History from './pages/History';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
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
      <Route path="/signup" element={<Signup />} />
      <Route path="/signup/:role" element={<SignupForm />} />
      <Route path="/verify" element={<VerifyOtp />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />

      <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="post" element={<PostShift />} />
        <Route path="manage" element={<Manage />} />
        <Route path="browse" element={<Browse />} />
        <Route path="my" element={<MyWork />} />
        <Route path="shifts/:id" element={<ShiftDetail />} />
        <Route path="history" element={<History />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />
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