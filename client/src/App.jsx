import { Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import Footer from './components/Footer.jsx';
import { StateProvider, RegionProvider } from './state.jsx';
import { MarketProvider } from './market.jsx';
import Propicks from './pages/Propicks.jsx';
import StrategyDetail from './pages/StrategyDetail.jsx';
import Methodology from './pages/Methodology.jsx';
import Screener from './pages/Screener.jsx';
import Watchlist from './pages/Watchlist.jsx';
import CalendarPage from './pages/Calendar.jsx';
import Stock from './pages/Stock.jsx';
import Assistant from './pages/Assistant.jsx';
import Funds from './pages/Funds.jsx';
import Saved from './pages/Saved.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <RegionProvider>
      <StateProvider>
        <MarketProvider>
          <div className="app">
            <Sidebar />
            <div className="main">
              <TopBar />
              <main className="content">
                <Routes>
                  <Route path="/" element={<Navigate to="/propicks" replace />} />
                  <Route path="/propicks" element={<Propicks />} />
                  <Route path="/propicks/methodology" element={<Methodology />} />
                  <Route path="/propicks/:slug" element={<StrategyDetail />} />
                  <Route path="/screener" element={<Screener />} />
                  <Route path="/watchlist" element={<Watchlist />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/stock/:ticker" element={<Stock />} />
                  <Route path="/assistant" element={<Assistant />} />
        <Route path="/funds" element={<Funds />} />
                  <Route path="/saved" element={<Saved />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </div>
        </MarketProvider>
      </StateProvider>
    </RegionProvider>
  );
}
