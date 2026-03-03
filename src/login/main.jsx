
import "./login.css"
import { useEffect, useRef, useState } from "react"
import Inicio from '../inicio_supervisor/main.jsx';
import qrcode from '../assets/tema_3.png'
import logoInicio from '../assets/logo_inicio.png'

export default function Login() {
    // URL fixa do backend Cloudflare Tunnel
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://notebook-instruction-fifty-larger.trycloudflare.com';

    // criando referencias
    const emailRef = useRef()
    const passwordRef = useRef()

    // salvando email e senha
    const [email, setEmail] = useState("");
    const [senha, setSenha] = useState("");
    const [remember, setRememberMe] = useState(false);
    const [error, setError] = useState("");
    const [loggedIn, setLoggedIn] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const [loading, setLoading] = useState(false); // indicates network request in progress
    const [lockedUntil, setLockedUntil] = useState(null); // timestamp
    const [remaining, setRemaining] = useState(0); // milliseconds remaining
    const [currentUser, setCurrentUser] = useState(null);

    // when component mounts, restore persisted state
    useEffect(() => {
        const saved = localStorage.getItem('LoginData');
        if (saved) {
            const {email, senha} = JSON.parse(saved);
            setEmail(email);
            setSenha(senha);
            setRememberMe(true);
            passwordRef.current?.focus();
        }
        const locked = localStorage.getItem('lockedUntil');
        if (locked) {
            setLockedUntil(parseInt(locked,10));
        }
        const at = localStorage.getItem('attempts');
        if (at) setAttempts(parseInt(at,10));

        if (localStorage.getItem('loggedIn')) {
            setLoggedIn(true);
            const persistedUser = localStorage.getItem('currentUser');
            if (persistedUser) {
                try {
                    setCurrentUser(JSON.parse(persistedUser));
                } catch {
                    setCurrentUser(null);
                }
            }
        }
    }, []);

    // countdown updater whenever lockedUntil changes
    useEffect(() => {
        if (!lockedUntil) return;
        const id = setInterval(() => {
            const now = Date.now();
            const diff = lockedUntil - now;
            if (diff <= 0) {
                setLockedUntil(null);
                setRemaining(0);
                clearInterval(id);
            } else {
                setRemaining(diff);
            }
        }, 1000);
        return () => clearInterval(id);
    }, [lockedUntil]);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setLoading(true);
        const now = Date.now();
        if (lockedUntil && now < lockedUntil) {
            setError('Conta bloqueada, tente novamente mais tarde');
            setLoading(false);
            return;
        }
        if (!email || !senha) {
            setError('Preencha email e senha');
            setLoading(false);
            return;
        }
        try {
            const resp = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha })
            });
            if (!resp.ok) {
                const text = await resp.text();
                console.warn('login failed', resp.status, text);
                setError('Credenciais inválidas');
                const newAttempts = attempts + 1;
                setAttempts(newAttempts);
                localStorage.setItem('attempts', newAttempts);
                if (newAttempts >= 5) {
                    const until = now + 5 * 60 * 1000;
                    setLockedUntil(until);
                    localStorage.setItem('lockedUntil', until);
                }
                setLoading(false);
                return;
            }
            const data = await resp.json();
            console.log('logado', data.user);
            setCurrentUser(data.user || null);
            setAttempts(0);
            localStorage.removeItem('attempts');
            localStorage.removeItem('lockedUntil');
            if (remember) {
                localStorage.setItem('LoginData', JSON.stringify({ email, senha }));
            } else {
                localStorage.removeItem('LoginData');
            }
            // persist login flag so reload doesn't reset state
            localStorage.setItem('loggedIn', '1');
            localStorage.setItem('currentUser', JSON.stringify(data.user || null));
            setLoggedIn(true);
            setLoading(false);
        } catch (err) {
            setError('Erro de conexão');
            console.error(err);
            setLoading(false);
        }
    }
    return (

        <>
        {loggedIn ? (
            <Inicio onExit={() => {
                localStorage.removeItem('loggedIn');
                localStorage.removeItem('currentUser');
                setCurrentUser(null);
                setLoggedIn(false);
            }} currentUser={currentUser} />
        ) : (

          <>
          <form className="login-container" onSubmit={handleSubmit}>
            
            <img
            src={logoInicio}
            alt="logo_inicio"
            className="logo-inicio"
            />

            <h2>Gestão de Carga e Transporte</h2>

            <input
                type="email"
                placeholder="Seu e-email"
                ref={emailRef}
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") passwordRef.current.focus(); }}
            />
            
            <div className="password-wrapper">
            <input
                type="password"
                placeholder="Sua senha"
                ref={passwordRef}
                value={senha}
                onChange={e => setSenha(e.target.value)}
            />
            </div>
            
            <div className="options-row">
                <div className="remember-me">
                    <label className="itens">
                        <input type="checkbox" checked={remember} onChange={e => setRememberMe(e.target.checked)} /> Lembrar-me
                    </label>
            
                <button
                    type="button"
                    className="hint-button"
                    onClick={() => alert('Dica: sua senha é sua matrícula, obs: para liberar novos usuários entre em contato com o gestor')}
                >?
                </button>

            </div>
            </div>
            
            <button type="submit" disabled={lockedUntil && Date.now() < lockedUntil || loading}>
                {loading ? 'Carregando...' : 'Entrar'}
            </button>
            {error && <div className="error">{error}</div>}
            {lockedUntil && Date.now() < lockedUntil && (
                <div className="lock-info">
                    Aguarde {Math.ceil(remaining/1000)} segundos para tentar novamente
                </div>
            )}

            <p style={{color: 'black'}}>Versão 1.1</p>
        </form>
            <div>
                <a href="https://www.agt.com.br/" target="_blank" rel="noopener noreferrer">
                    <img 
                        src={qrcode}
                        alt="Acessar Site Oficial"
                        className="qrcode"
                    />
                </a>
            </div>
          </>
        )}
        </>
    )
}
