import React, { useEffect, useRef, useState } from 'react';
import styles from './Navbar.module.css';
import useAuthStore from '../store/authStore.js';
import useCommunityStore from '../store/communityStore.js';
import LoginDropdown from './navbar/LoginDropdown.jsx';
import UserMenuDropdown from './navbar/UserMenuDropdown.jsx';
import { useNavbarLogic } from '../hooks/useNavbarLogic.js';

const Navbar = () => {
    const { user, logout, initialize } = useAuthStore();
    const [menuOpen, setMenuOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const loginMenuRef = useRef(null);
    const userMenuRef = useRef(null);

    const {
        navigatingMyBoard,
        navigatingCheer,
        loginOpen,
        setLoginOpen,
        loggingIn,
        loginError,
        goToMyBoard,
        cheer,
        performLogin
    } = useNavbarLogic();

    const { stats, fetchStats } = useCommunityStore();

    useEffect(() => {
        initialize();
        fetchStats();
    }, [initialize, fetchStats]);

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        const success = await performLogin(email, password);
        if (success) {
            setEmail('');
            setPassword('');
        }
    };

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (loginOpen && loginMenuRef.current && !loginMenuRef.current.contains(e.target)) {
                setLoginOpen(false);
            }
            if (menuOpen && userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                setLoginOpen(false);
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [loginOpen, menuOpen, setLoginOpen]);

    const assetsBaseUrl = import.meta.env.VITE_ASSETS_BASE_URL || '/assets';

    return (
        <nav className={styles.nav}>
            <div className={styles.logoContainer} onClick={() => { window.location.hash = '#/'; }}>
                <img src={`${assetsBaseUrl}/stickerboards_star_fixed.png`} alt="Logo" className={styles.logoImage} />
            </div>

            <ul className={styles.navLinks}>
                {stats.totalWeightLost > 0 && (
                    <li className={styles.communityStats}>
                        <span className={styles.statsLabel}>{Math.round(stats.totalWeightLost)} lbs lost together</span>
                    </li>
                )}
                <li>
                    <button className={styles.link} disabled={navigatingMyBoard} onClick={goToMyBoard}>
                        {navigatingMyBoard ? 'My Board…' : 'My Board'}
                    </button>
                </li>
                <li>
                    <button className={styles.link} onClick={() => { window.location.hash = '#/explore'; }}>
                        Explore
                    </button>
                </li>
                <li>
                    <button className={styles.link} disabled={navigatingCheer} onClick={cheer}>
                        {navigatingCheer ? 'Cheering…' : 'Cheer!'}
                    </button>
                </li>
                <li>
                    <a
                        href="https://github.com/jcarroll95/stickers"
                        className={styles.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                        GitHub
                    </a>
                </li>
                <li>
                    <a
                        href="https://stickerboards.app/apidocs.html"
                        className={styles.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                        API Docs
                    </a>
                </li>
            </ul>

            <div className={styles.auth}>
                {!user ? (
                    <>
                        <button
                            className={`${styles.button} ${styles.createAccountButton}`}
                            onClick={() => { window.location.hash = '#/register'; }}
                        >
                            Create Account
                        </button>
                        <div className={styles.userMenu} ref={loginMenuRef}>
                            <button className={`${styles.button} ${styles.loginButton}`} onClick={() => setLoginOpen(!loginOpen)}>
                                Login
                            </button>
                            {loginOpen && (
                                <LoginDropdown
                                    email={email} setEmail={setEmail}
                                    password={password} setPassword={setPassword}
                                    loggingIn={loggingIn} loginError={loginError}
                                    onSubmit={handleLoginSubmit}
                                />
                            )}
                        </div>
                    </>
                ) : (
                    <div className={styles.userMenu} ref={userMenuRef}>
                        <button className={styles.userName} onClick={() => setMenuOpen(!menuOpen)}>
                            {user.name || 'User'}
                        </button>
                        {menuOpen && (
                            <UserMenuDropdown
                                user={user}
                                navigatingMyBoard={navigatingMyBoard}
                                onGoToMyBoard={goToMyBoard}
                                onLogout={logout}
                                onClose={() => setMenuOpen(false)}
                            />
                        )}
                    </div>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
