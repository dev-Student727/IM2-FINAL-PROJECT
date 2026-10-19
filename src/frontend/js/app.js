document.addEventListener('DOMContentLoaded', function() {
    // Toggle this boolean to simulate database account check
    // false = Don't have an account
    // true = Have an account
    let mockDatabaseHasAccount = false;
    
    const loginBtn = document.getElementById('login-btn');
    const modalOverlay = document.getElementById('custom-modal');
    const modalMsgText = document.getElementById('modal-msg-text');
    const modalBtnContainer = document.getElementById('modal-btn-container');

    // Helper function to create a button
    function showCustomModal(message, buttonConfig) {
        modalMsgText.textContent = message;
        modalBtnContainer.innerHTML = ''; // Clear previous buttons

        buttonConfig.forEach(config => {
            const btn = document.createElement('button');
            btn.textContent = config.text;
            btn.className = `modal-btn ${config.primary ? 'modal-btn-primary' : 'modal-btn-secondary'}`;
            btn.addEventListener('click', function() {
                modalOverlay.classList.remove('active');
                if (config.callback) {
                    config.callback();
                }
            });
            modalBtnContainer.appendChild(btn);
        });

        modalOverlay.classList.add('active');
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', function(e) {
            e.preventDefault(); // Prevent form submission

            if (mockDatabaseHasAccount) {
                // System detects that the user has an account
                showCustomModal('You already have an account.', [
                    {
                        text: "OK",
                        primary: true,
                        callback: function() {
                            // Redirect to login page
                            window.location.href = 'pages/login.html';
                        }
                    }
                ]);
            } else {
                // System detects that the user does not have an account
                showCustomModal('You do not have an account yet.', [
                    {
                        text: "OK",
                        primary: true,
                        callback: function() {
                            // When OK is clicked, redirect to signup page
                            showCustomModal('Do you want to signup or create an account?', [
                                {
                                    text: "Yes",
                                    primary: true,
                                    callback: function() {
                                        // Redirect to signup page
                                        window.location.href = 'pages/signup.html';
                                    }
                                },
                                {
                                    text: "No",
                                    primary: false,
                                    callback: function() {
                                        // If No is clicked, prompt if the user wants to go back to the welcome page
                                        showCustomModal('Do you want to exit?', [
                                            {
                                                text: "Yes",
                                                primary: true,
                                                callback: function() {
                                                    // Go Back to Welcome Page
                                                    window.location.href = window.location.pathname;
                                                }
                                            },
                                            {
                                                text: "No",
                                                primary: false,
                                                callback: function() {
                                                    // if no, then continue to sigup form
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
            } 
        });
    }
});