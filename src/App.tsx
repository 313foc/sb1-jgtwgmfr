import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/auth/AuthProvider';
import { ErrorBoundary } from './components/monitoring/ErrorBoundary';
import { Header } from './components/layout/Header';
import { LandingPage } from './components/landing/LandingPage';
import { LoginPage } from './components/auth/LoginPage';
import { SignUpPage } from './components/auth/SignUpPage';
import { UserDashboard } from './components/dashboard/UserDashboard';
import { GameHistory } from './components/history/GameHistory';
import { CurrencyStore } from './components/store/CurrencyStore';
import { GamesPage } from './components/games/GamesPage';
import { GameLobby } from './components/games/GameLobby';

// Import slot machines
import { CyberCowboy } from './components/games/slots/CyberCowboy';
import { GoldRush } from './components/games/slots/GoldRush';
import { AlienSaloon } from './components/games/slots/AlienSaloon';
import { SteamPunk } from './components/games/slots/SteamPunk';
import { QuantumBounty } from './components/games/slots/QuantumBounty';

// Import table games
import { Blackjack } from './components/games/Blackjack';
import { PokerRoom } from './components/games/poker/PokerRoom';
import { Roulette } from './components/games/Roulette';
import { USRoulette } from './components/games/USRoulette';
import { Craps } from './components/games/Craps';

// Import instant win games
import { ScratchCard } from './components/games/ScratchCard';
import { CoinFlip } from './components/games/CoinFlip';

// Import special events
import { Raffle } from './components/games/Raffle';
import { HorseRacing } from './components/games/HorseRacing';

// Import other components
import { ProfilePage } from './components/profile/ProfilePage';
import { TournamentList } from './components/tournaments/TournamentList';
import { TournamentDetail } from './components/tournaments/TournamentDetail';
import { Leaderboard } from './components/social/Leaderboard';
import { Chat } from './components/social/Chat';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminRoute } from './components/admin/AdminRoute';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-gray-100">
            <Header />
            <main>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignUpPage />} />
                <Route path="/dashboard" element={<UserDashboard />} />
                <Route path="/history" element={<GameHistory />} />
                <Route path="/store" element={<CurrencyStore />} />
                <Route path="/games" element={<GamesPage />} />
                <Route path="/lobby" element={<GameLobby />} />
                
                {/* Slot machine routes */}
                <Route path="/slots/cyber-cowboy" element={<CyberCowboy />} />
                <Route path="/slots/gold-rush" element={<GoldRush />} />
                <Route path="/slots/alien-saloon" element={<AlienSaloon />} />
                <Route path="/slots/steampunk" element={<SteamPunk />} />
                <Route path="/slots/quantum-bounty" element={<QuantumBounty />} />
                
                {/* Table game routes */}
                <Route path="/blackjack" element={<Blackjack />} />
                <Route path="/poker" element={<PokerRoom />} />
                <Route path="/roulette" element={<Roulette />} />
                <Route path="/us-roulette" element={<USRoulette />} />
                <Route path="/craps" element={<Craps />} />
                
                {/* Instant win routes */}
                <Route path="/scratch-card" element={<ScratchCard />} />
                <Route path="/coin-flip" element={<CoinFlip />} />
                
                {/* Special event routes */}
                <Route path="/raffle" element={<Raffle />} />
                <Route path="/horse-racing" element={<HorseRacing />} />
                
                {/* Other routes */}
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/tournaments" element={<TournamentList />} />
                <Route path="/tournaments/:id" element={<TournamentDetail />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route
                  path="/admin"
                  element={
                    <AdminRoute>
                      <AdminDashboard />
                    </AdminRoute>
                  }
                />
              </Routes>
            </main>
            <Chat />
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;