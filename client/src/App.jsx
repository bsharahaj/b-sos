import { Routes, Route } from 'react-router-dom';
import { GuestOnly, RequireAuth } from './components/RouteGuards.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import VerifyPhone from './pages/VerifyPhone.jsx';
import Profile from './pages/Profile.jsx';
import CreateSos from './pages/CreateSos.jsx';
import ActiveSos from './pages/ActiveSos.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
        <Route path="/verify-phone" element={<VerifyPhone />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/sos/new" element={<CreateSos />} />
        <Route path="/sos/:id" element={<ActiveSos />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
