const FRONTEND_ROOT_URL = new URL('../', document.currentScript.src);
const LOGIN_PAGE_URL = new URL('pages/login.html', FRONTEND_ROOT_URL);
const SIGNUP_PAGE_URL = new URL('pages/signup.html', FRONTEND_ROOT_URL);

async function checkLocalAccount() {
    const result = await window.MRBLocalStore.request('/auth/account-exists');
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
        showCustomModal(
            'Notice: We are currently making ongoing system improvements. Some features may be temporarily unavailable. Thank you for your patience.',
            [
                {
                    text: 'Continue',
                    primary: true
                }
            ]
        );

        loginBtn.addEventListener('click', async function(event) {
            event.preventDefault();
            if (loginBtn.disabled) return;
            loginBtn.disabled = true;
            showCustomModal('Checking for an account saved in this browser…', []);

            let hasAccount;
            try {
                hasAccount = await checkLocalAccount();
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
