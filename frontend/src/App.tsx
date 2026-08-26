import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from './store';
import { canAccess } from './lib/nav';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PlansPage from './pages/PlansPage';
import ProductionEntriesPage from './pages/ProductionEntriesPage';
import ChangeoverEntriesPage from './pages/ChangeoverEntriesPage';
import {
  UsersPage,
  PlantsPage,
  LinesPage,
  BrandsPage,
  ProductsPage,
  MachinesPage,
  ShiftsPage,
  ChangeoverTypesPage,
} from './pages/MasterPages';
import {
  OeePage,
  PlanVsActualPage,
  DowntimeAnalysisPage,
  ChangeoverAnalysisPage,
  ManpowerAnalysisPage,
  MonitoringPage,
  ApprovalsPage,
  ReportsPage,
  NotificationsPage,
  AuditLogsPage,
  SettingsPage,
  ProfilePage,
} from './pages/AnalyticsPages';
import LineWiseOverviewPage from './pages/LineWiseOverviewPage';
import DayWiseOeePage from './pages/DayWiseOeePage';
import WeekWiseOeePage from './pages/WeekWiseOeePage';
import ProductionTargetsPage from './pages/ProductionTargetsPage';
import OeeGuidanceLayout from './pages/oee-guidance/OeeGuidanceLayout';
import OeeGuidanceHubPage from './pages/oee-guidance/OeeGuidanceHubPage';
import OeeRatingScalePage from './pages/oee-guidance/OeeRatingScalePage';
import OeePillarPage from './pages/oee-guidance/OeePillarPage';
import HomePage from './pages/HomePage';
import MobileLayout from './mobile/MobileLayout';
import MobileHomePage from './mobile/pages/MobileHomePage';
import MobileFloorPage from './mobile/pages/MobileFloorPage';
import MobileLinesPage from './mobile/pages/MobileLinesPage';
import MobileAlertsPage from './mobile/pages/MobileAlertsPage';
import MobileMorePage from './mobile/pages/MobileMorePage';
import WasteEntriesPage from './pages/WasteEntriesPage';
import WastageStatusPage from './pages/WastageStatusPage';
import WasteReportPage from './pages/WasteReportPage';
import SalesDashboardPage from './pages/SalesDashboardPage';
import RftDashboardPage from './pages/RftDashboardPage';
import RftEntriesPage from './pages/RftEntriesPage';
import Top5AnalysisPage from './pages/Top5AnalysisPage';
import type { ReactNode } from 'react';

function Protected({ children, path }: { children: ReactNode; path: string }) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token) || localStorage.getItem('pms_token');
  const location = useLocation();
  if (!token || !user) {
    const next = location.pathname.startsWith('/m') ? '/login?next=/m' : '/login';
    return <Navigate to={next} replace />;
  }
  if (!canAccess(user.role, path)) return <Navigate to="/home" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/m"
        element={
          <Protected path="/home">
            <MobileLayout />
          </Protected>
        }
      >
        <Route index element={<MobileHomePage />} />
        <Route path="floor" element={<MobileFloorPage />} />
        <Route path="lines" element={<MobileLinesPage />} />
        <Route path="alerts" element={<MobileAlertsPage />} />
        <Route path="more" element={<MobileMorePage />} />
      </Route>
      <Route
        path="/"
        element={
          <Protected path="/home">
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="sales-dashboard" element={<Protected path="/sales-dashboard"><SalesDashboardPage /></Protected>} />
        <Route path="line-wise" element={<Protected path="/line-wise"><LineWiseOverviewPage /></Protected>} />
        <Route path="day-wise-oee" element={<Protected path="/day-wise-oee"><DayWiseOeePage /></Protected>} />
        <Route path="week-wise-oee" element={<Protected path="/week-wise-oee"><WeekWiseOeePage /></Protected>} />
        <Route path="oee" element={<Protected path="/oee"><OeePage /></Protected>} />
        <Route
          path="oee-guidance"
          element={
            <Protected path="/oee-guidance">
              <OeeGuidanceLayout />
            </Protected>
          }
        >
          <Route index element={<OeeGuidanceHubPage />} />
          <Route path="rating-scale" element={<OeeRatingScalePage />} />
          <Route path=":pillarId" element={<OeePillarPage />} />
        </Route>
        <Route path="plan-vs-actual" element={<Protected path="/plan-vs-actual"><PlanVsActualPage /></Protected>} />
        <Route path="top5-analysis" element={<Protected path="/top5-analysis"><Top5AnalysisPage /></Protected>} />
        <Route path="users" element={<Protected path="/users"><UsersPage /></Protected>} />
        <Route path="plants" element={<Protected path="/plants"><PlantsPage /></Protected>} />
        <Route path="lines" element={<Protected path="/lines"><LinesPage /></Protected>} />
        <Route path="products" element={<Protected path="/products"><ProductsPage /></Protected>} />
        <Route path="production-targets" element={<Protected path="/production-targets"><ProductionTargetsPage /></Protected>} />
        <Route path="brands" element={<Protected path="/brands"><BrandsPage /></Protected>} />
        <Route path="machines" element={<Protected path="/machines"><MachinesPage /></Protected>} />
        <Route path="shifts" element={<Protected path="/shifts"><ShiftsPage /></Protected>} />
        <Route path="changeover-types" element={<Protected path="/changeover-types"><ChangeoverTypesPage /></Protected>} />
        <Route path="plans" element={<Protected path="/plans"><PlansPage /></Protected>} />
        <Route path="production-entries" element={<Protected path="/production-entries"><ProductionEntriesPage /></Protected>} />
        <Route path="waste-entries" element={<Protected path="/waste-entries"><WasteEntriesPage /></Protected>} />
        <Route path="wastage-status" element={<Protected path="/wastage-status"><WastageStatusPage /></Protected>} />
        <Route path="changeover-entries" element={<Protected path="/changeover-entries"><ChangeoverEntriesPage /></Protected>} />
        <Route path="rft-entries" element={<Protected path="/rft-entries"><RftEntriesPage /></Protected>} />
        <Route path="shop-floor" element={<Navigate to="/production-entries" replace />} />
        <Route path="approvals" element={<Protected path="/approvals"><ApprovalsPage /></Protected>} />
        <Route path="monitoring" element={<Protected path="/monitoring"><MonitoringPage /></Protected>} />
        <Route path="downtime-analysis" element={<Protected path="/downtime-analysis"><DowntimeAnalysisPage /></Protected>} />
        <Route path="changeover-analysis" element={<Protected path="/changeover-analysis"><ChangeoverAnalysisPage /></Protected>} />
        <Route path="rft" element={<Protected path="/rft"><RftDashboardPage /></Protected>} />
        <Route path="manpower-analysis" element={<Protected path="/manpower-analysis"><ManpowerAnalysisPage /></Protected>} />
        <Route path="waste-report" element={<Protected path="/waste-report"><WasteReportPage /></Protected>} />
        <Route path="reports" element={<Protected path="/reports"><ReportsPage /></Protected>} />
        <Route path="notifications" element={<Protected path="/notifications"><NotificationsPage /></Protected>} />
        <Route path="audit-logs" element={<Protected path="/audit-logs"><AuditLogsPage /></Protected>} />
        <Route path="settings" element={<Protected path="/settings"><SettingsPage /></Protected>} />
        <Route path="profile" element={<Protected path="/profile"><ProfilePage /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
