// App.js
import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import ParticlesBg from 'particles-bg';
import { useRecoilState } from 'recoil';
import { userState } from './recoil/atoms';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, getUser } from './firebase';
import { IoArrowUp } from "react-icons/io5";
import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import Loader from './components/Loader/Loader';
import Home from './pages/Home/Home';
import About from './pages/About/About';
import Contact from './pages/Contact/Contact';
import { Login } from './pages/Auth/Login';
import { Register } from './pages/Auth/Register';
import NotFound from './pages/NotFound/NotFound';
import ProtectedRoute from './utils/ProtectedRoute';
import ProtectedAuthRoute from './utils/ProtectedAuthRoute';
import Notification from './components/Notification/Notification';
import Products from './components/Products/Products';
import Payment from './pages/Pay/Payment';

function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useRecoilState(userState);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        getUser(currentUser.email, setUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);


  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 200);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="App">
      {loading ? <Loader /> : (
        <>
          <ParticlesBg type="cobweb" bg={true} color='#ebf4fc' />
          <Navbar />
          <Notification />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="store" element={<Products />} />
            <Route path="pay" element={<ProtectedRoute><Payment /></ProtectedRoute>} />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
            <Route path="login" element={<ProtectedAuthRoute><Login /></ProtectedAuthRoute>} />
            <Route path="register" element={<ProtectedAuthRoute><Register /></ProtectedAuthRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          {isScrolled && (
            <button className="btn top" title="to top" onClick={handleScrollToTop}>
              <IoArrowUp />
            </button>
          )}
          <Footer />
        </>
      )}
    </div>
  );
}

export default App;
