// auth.js - Handles global session checking and UI updates

document.addEventListener('DOMContentLoaded', async () => {
    const authWrapper = document.querySelector('.auth-wrapper');

    try {
        const response = await fetch('/api/me', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            const user = await response.json();
            const formattedBalance = user.balance.toFixed(2);
            
            // If we are on konto.html, populate properties
            const displayBalance = document.getElementById('display-balance');
            const infoUsername = document.getElementById('info-username');
            if (displayBalance) displayBalance.innerText = formattedBalance + ' PLN';
            if (infoUsername) infoUsername.innerText = user.username;

            // User is logged in, update auth wrapper gracefully
            if (authWrapper) {
                authWrapper.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <a href="konto.html" style="text-decoration: none;">
                            <div style="background: rgba(0, 0, 0, 0.4); padding: 0.5rem 1rem; border-radius: 30px; border: 1px solid var(--glass-border); box-shadow: 0 4px 15px rgba(0,0,0,0.3); color: var(--text-white); font-weight: bold; font-variant-numeric: tabular-nums; transition: transform 0.2s, background 0.2s; cursor: pointer;" onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.transform='scale(1.05)';" onmouseout="this.style.background='rgba(0,0,0,0.4)'; this.style.transform='scale(1)';">
                                <i class="fa-solid fa-wallet" style="color: var(--accent-1); margin-right: 5px;"></i> ${formattedBalance} PLN
                            </div>
                        </a>
                        <a href="konto.html" style="text-decoration: none;">
                            <div style="color: var(--text-white); font-weight: 600; display: flex; align-items: center; gap: 8px; transition: color 0.2s;" onmouseover="this.style.color='var(--accent-1)'" onmouseout="this.style.color='var(--text-white)'">
                                <i class="fa-solid fa-circle-user" style="color: var(--accent-2); font-size: 1.2rem;"></i> ${user.username}
                            </div>
                        </a>
                        <button id="logout-btn" class="btn-auth" style="border: none; padding: 0.5rem 1rem; border-radius: 30px; cursor: pointer; font-family: inherit; font-weight: 600; margin-left: 10px;">Wyloguj</button>
                    </div>
                `;

                document.getElementById('logout-btn').addEventListener('click', async () => {
                    await fetch('/api/logout', { method: 'POST' });
                    window.location.href = 'strona.html';
                });
            }

            // Redirect away from login explicitly if logged in
            if (window.location.pathname.endsWith('logowanie.html')) {
                window.location.href = 'konto.html';
            }
        } else {
            // Not logged in. Ensure authWrapper has the basic login button
            if (authWrapper) {
                authWrapper.innerHTML = `
                    <a href="logowanie.html" class="btn-auth" style="transform: scale(1.05); box-shadow: 0 8px 25px rgba(255, 0, 127, 0.6);"><i class="fa-solid fa-user"></i> Logowanie / Rejestracja</a>
                `;
            }
            
            // Re-route to login if accessing konto.html without auth
            if (window.location.pathname.endsWith('konto.html')) {
                window.location.href = 'logowanie.html';
            }
        }
    } catch (error) {
        console.error('Błąd weryfikacji sesji:', error);
    }
});
