// ============================================================
// CargoNepal — Application router (spec §37, §57)
// ============================================================
// Landing + auth are public. Customer/Rider/Admin are role-gated.
// ============================================================

import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth, RequireRole, RoleRedirect } from "@/routes/guards";
import { CustomerLayout } from "@/screens/customer/CustomerLayout";
import { RiderLayout } from "@/screens/rider/RiderLayout";
import { AdminLayout } from "@/screens/admin/AdminLayout";
import { Spinner } from "@/components/ui";

// Lazy-loaded route groups for performance (spec §56).
const Landing = lazy(() => import("@/screens/landing/LandingPage"));
const Login = lazy(() => import("@/screens/auth/LoginScreen"));
const OtpVerify = lazy(() => import("@/screens/auth/OtpVerifyScreen"));
const SignUp = lazy(() => import("@/screens/auth/SignUpScreen"));
const AuthCallback = lazy(() => import("@/screens/auth/AuthCallback"));
const RiderJoin = lazy(() => import("@/screens/rider/RiderJoinScreen"));
const SetupGuide = lazy(() => import("@/screens/auth/SetupGuide"));

// Customer screens
const CHome = lazy(() => import("@/screens/customer/HomeScreen"));
const CBook = lazy(() => import("@/screens/customer/BookParcelScreen"));
const CTrack = lazy(() => import("@/screens/customer/LiveTrackingScreen"));
const COrders = lazy(() => import("@/screens/customer/OrdersScreen"));
const COrderDetail = lazy(() => import("@/screens/customer/OrderDetailScreen"));
const CNotifications = lazy(() => import("@/screens/customer/NotificationsScreen"));
const CProfile = lazy(() => import("@/screens/customer/ProfileScreen"));
const CAddresses = lazy(() => import("@/screens/customer/AddressesScreen"));
const CPayments = lazy(() => import("@/screens/customer/PaymentHistoryScreen"));
const CSupport = lazy(() => import("@/screens/customer/SupportScreen"));
const CCheckout = lazy(() => import("@/screens/customer/CheckoutScreen"));

// Rider screens
const RHome = lazy(() => import("@/screens/rider/HomeScreen"));
const RDeliveries = lazy(() => import("@/screens/rider/DeliveriesScreen"));
const RActive = lazy(() => import("@/screens/rider/ActiveDeliveryScreen"));
const REarnings = lazy(() => import("@/screens/rider/EarningsScreen"));
const RProfile = lazy(() => import("@/screens/rider/ProfileScreen"));
const RVerification = lazy(() => import("@/screens/rider/VerificationScreen"));

// Admin screens
const ADashboard = lazy(() => import("@/screens/admin/DashboardScreen"));
const AOrders = lazy(() => import("@/screens/admin/OrdersScreen"));
const AOrderDetail = lazy(() => import("@/screens/admin/OrderDetailScreen"));
const ALiveMap = lazy(() => import("@/screens/admin/LiveMapScreen"));
const ARiders = lazy(() => import("@/screens/admin/RidersScreen"));
const ACustomers = lazy(() => import("@/screens/admin/CustomersScreen"));
const APayments = lazy(() => import("@/screens/admin/PaymentsScreen"));
const ACod = lazy(() => import("@/screens/admin/CodScreen"));
const APricing = lazy(() => import("@/screens/admin/PricingScreen"));
const APromos = lazy(() => import("@/screens/admin/PromotionsScreen"));
const AServiceAreas = lazy(() => import("@/screens/admin/ServiceAreasScreen"));
const AReports = lazy(() => import("@/screens/admin/ReportsScreen"));
const ASupport = lazy(() => import("@/screens/admin/SupportScreen"));
const ASettings = lazy(() => import("@/screens/admin/SettingsScreen"));
const AAudit = lazy(() => import("@/screens/admin/AuditLogsScreen"));

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8 text-brand-600" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<RoleRedirect><Login /></RoleRedirect>} />
        <Route path="/signup" element={<RoleRedirect><SignUp /></RoleRedirect>} />
        <Route path="/auth/verify-otp" element={<OtpVerify />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/rider/join" element={<RiderJoin />} />
        <Route path="/setup" element={<SetupGuide />} />

        {/* Customer */}
        <Route path="/customer" element={<RequireAuth><RequireRole roles={["customer"]}><CustomerLayout /></RequireRole></RequireAuth>}>
          <Route index element={<CHome />} />
          <Route path="book" element={<CBook />} />
          <Route path="checkout/:orderId" element={<CCheckout />} />
          <Route path="track/:orderId" element={<CTrack />} />
          <Route path="orders" element={<COrders />} />
          <Route path="orders/:orderId" element={<COrderDetail />} />
          <Route path="notifications" element={<CNotifications />} />
          <Route path="profile" element={<CProfile />} />
          <Route path="addresses" element={<CAddresses />} />
          <Route path="payments" element={<CPayments />} />
          <Route path="support" element={<CSupport />} />
        </Route>

        {/* Rider */}
        <Route path="/rider" element={<RequireAuth><RequireRole roles={["rider"]}><RiderLayout /></RequireRole></RequireAuth>}>
          <Route index element={<RHome />} />
          <Route path="deliveries" element={<RDeliveries />} />
          <Route path="active/:orderId" element={<RActive />} />
          <Route path="earnings" element={<REarnings />} />
          <Route path="profile" element={<RProfile />} />
          <Route path="verification" element={<RVerification />} />
        </Route>

        {/* Admin */}
        <Route path="/admin" element={<RequireAuth><RequireRole roles={["admin", "super_admin"]}><AdminLayout /></RequireRole></RequireAuth>}>
          <Route index element={<ADashboard />} />
          <Route path="orders" element={<AOrders />} />
          <Route path="orders/:orderId" element={<AOrderDetail />} />
          <Route path="live-map" element={<ALiveMap />} />
          <Route path="riders" element={<ARiders />} />
          <Route path="customers" element={<ACustomers />} />
          <Route path="payments" element={<APayments />} />
          <Route path="cod" element={<ACod />} />
          <Route path="pricing" element={<APricing />} />
          <Route path="promotions" element={<APromos />} />
          <Route path="service-areas" element={<AServiceAreas />} />
          <Route path="reports" element={<AReports />} />
          <Route path="support" element={<ASupport />} />
          <Route path="settings" element={<ASettings />} />
          <Route path="audit" element={<AAudit />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
