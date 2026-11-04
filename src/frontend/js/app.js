const WELCOME_API_BASE = window.MRB_API_BASE_URL;
const FRONTEND_ROOT_URL = new URL('../', document.currentScript.src);
const LOGIN_PAGE_URL = new URL('pages/login.html', FRONTEND_ROOT_URL);
const SIGNUP_PAGE_URL = new URL('pages/signup.html', FRONTEND_ROOT_URL);

async function fetchWelcomeApi(path, options) {
    let lastNetworkError;

    for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
            return await fetch(`${WELCOME_API_BASE}${path}`, options);
        } catch (error) {
            if (!(error instanceof TypeError)) throw error;
            lastNetworkError = error;
            if (attempt < 9) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    throw new Error(
        `Cannot reach the backend API at ${WELCOME_API_BASE}. Verify that the Render service is available and ` +
        `that its CORS_ALLOWED_ORIGINS setting includes this Vercel site's exact URL.`,
        { cause: lastNetworkError }
    );
}

async function checkDatabaseForAccount() {
    const response = await fetchWelcomeApi('/auth/account-exists', {
        credentials: 'include'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = result.error || `Account check failed (${response.status}).`;
        throw new Error(result.diagnostic ? `${message} ${result.diagnostic}` : message);
    }
    return result.exists;
}

document.addEventListener('DOMContentLoaded', function() {

    const loginBtn = document.getElementById('login-btn');
    const modalOverlay = document.getElementById('custom-modal');
    const modalMsgText = document.getElementById('modal-msg-text');
    const modalBtnContainer = document.getElementById('modal-btn-container');

    function showCustomModal(message, buttonConfig) {
        modalMsgText.textContent = message;
        modalBtnContainer.replaceChildren();

        buttonConfig.forEach(config => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = config.text;
            button.className = `modal-btn ${config.primary ? 'modal-btn-primary' : 'modal-btn-secondary'}`;
            button.addEventListener('click', function() {
                modalOverlay.classList.remove('active');
                if (config.callback) {
                    config.callback();
                }
            });
            modalBtnContainer.appendChild(button);
        });

        modalOverlay.classList.add('active');
    }

    if (loginBtn && modalOverlay && modalMsgText && modalBtnContainer) {
        loginBtn.addEventListener('click', async function(event) {
            event.preventDefault();
            if (loginBtn.disabled) return;
            loginBtn.disabled = true;
            showCustomModal('Checking the XAMPP database for an account…', []);

            let hasAccount;
            try {
                hasAccount = await checkDatabaseForAccount();
            } catch (error) {
                showCustomModal(error.message, [
                    {
                        text: 'Retry',
                        primary: true,
                        callback: () => loginBtn.click()
                    },
                    {
                        text: 'Close',
                        primary: false
                    }
                ]);
                loginBtn.disabled = false;
                return;
            }
            loginBtn.disabled = false;

            if (hasAccount) {
                showCustomModal('You already have an account.', [
                    {
                        text: 'OK',
                        primary: true,
                        callback: function() {
                            window.location.href = LOGIN_PAGE_URL.href;
                        }
                    }
                ]);
                return;
            }

            showCustomModal('You do not have an account yet.', [
                {
                    text: 'OK',
                    primary: true,
                    callback: function() {
                        showCustomModal('Do you want to signup or create an account?', [
                            {
                                text: 'Yes',
                                primary: true,
                                callback: function() {
                                    window.location.href = SIGNUP_PAGE_URL.href;
                                }
                            },
                            {
                                text: 'No',
                                primary: false,
                                callback: function() {
                                    showCustomModal('Do you want to exit?', [
                                        {
                                            text: 'Yes',
                                            primary: true,
                                            callback: function() {
                                                window.location.href = FRONTEND_ROOT_URL.href;
                                            }
                                        },
                                        {
                                            text: 'No',
                                            primary: false,
                                            callback: function() {
                                                window.location.href = SIGNUP_PAGE_URL.href;
                                            }
                                        }
                                    ]);
                                }
                            }
                        ]);
                    }
                }
            ]);
        });
    }
});
