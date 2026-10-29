document.addEventListener('DOMContentLoaded', function() {
    // UI-only placeholder while the backend and database integration are reset.
    const mockDatabaseHasAccount = false;

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
        loginBtn.addEventListener('click', function(event) {
            event.preventDefault();

            if (mockDatabaseHasAccount) {
                showCustomModal('You already have an account.', [
                    {
                        text: 'OK',
                        primary: true,
                        callback: function() {
                            window.location.href = 'pages/login.html';
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
                                    window.location.href = 'pages/signup.html';
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
                                                window.location.href = window.location.pathname;
                                            }
                                        },
                                        {
                                            text: 'No',
                                            primary: false,
                                            callback: function() {
                                                window.location.href = 'pages/signup.html';
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
