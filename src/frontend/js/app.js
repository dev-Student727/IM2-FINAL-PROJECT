const FRONTEND_ROOT_URL = new URL('../', document.currentScript.src);
const SIGNUP_PAGE_URL = new URL('pages/signup.html', FRONTEND_ROOT_URL);
const APP_WELCOME_PAGE_URL = new URL('index.html', FRONTEND_ROOT_URL);

async function checkLocalAccount() {
    const result = await window.MRBLocalStore.request('/auth/account-exists');
    return result.exists;
}

document.addEventListener('DOMContentLoaded', function() {

    const createAccountBtn = document.getElementById('create-account-btn');
    const loginContainer = document.querySelector('.login-container');
    const userIdInput = document.getElementById('user-id');
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

    if (createAccountBtn && modalOverlay && modalMsgText && modalBtnContainer) {
        createAccountBtn.addEventListener('click', async function(event) {
            event.preventDefault();
            if (createAccountBtn.disabled) return;
            createAccountBtn.disabled = true;
            showCustomModal('Checking for an account saved in this browser…', []);

            let hasAccount;
            try {
                hasAccount = await checkLocalAccount();
            } catch (error) {
                showCustomModal(error.message, [
                    {
                        text: 'Retry',
                        primary: true,
                        callback: () => createAccountBtn.click()
                    },
                    {
                        text: 'Close',
                        primary: false
                    }
                ]);
                createAccountBtn.disabled = false;
                return;
            }
            createAccountBtn.disabled = false;

            if (hasAccount) {
                showCustomModal('You already have an account.', [
                    {
                        text: 'OK',
                        primary: true,
                        callback: function() {
                            loginContainer.classList.remove('is-highlighted');
                            void loginContainer.offsetWidth;
                            loginContainer.classList.add('is-highlighted');
                            userIdInput?.focus();
                            loginContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                        showCustomModal('Do you want to create an account?', [
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
                                                window.location.href = APP_WELCOME_PAGE_URL.href;
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
