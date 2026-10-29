// Sign Up authentication function

document.addEventListener('DOMContentLoaded', function() {
    const nextBtn = document.getElementById('next-btn')

    const userIdInput = document.getElementById('user-id');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const submitBtn = document.getElementById('submit-btn');

    const togglePasswordBtn = document.getElementById('toggle-password');
    const toggleConfirmBtn = document.getElementById('toggle-confirm');
    const eyeIconPwd = document.getElementById('eye-icon-pwd');
    const eyeIconConfirm = document.getElementById('eye-icon-conf');
    const matchError = document.getElementById('match-error');

    const reqIdLen = document.getElementById('req-id-len');
    const reIdNoSpace = document.getElementById('req-id-no-space');
    const reqPwdLen = document.getElementById('req-pwd-len');
    const reqPwdUpper = document.getElementById('req-pwd-upper');
    const reqPwdNum = document.getElementById('req-pwd-num');
    const reqPwdSpecial = document.getElementById('req-pwd-special');

    // Nect button, will automatically activated once all required field has been fill out
    if (nextBtn && nextBtn.form) {
        nextBtn.form.addEventListener('submit', function(event) {
            event.preventDefault();

            // Carry profile details to the next page temporarily, without storing credentials.
            sessionStorage.setItem('signup-profile', JSON.stringify({
                name: document.getElementById('user-name').value.trim(),
                email: document.getElementById('user-email').value.trim(),
                contact_number: document.getElementById('user-phone').value.trim()
            }));
            window.location.href = 'funnel/signup2.html';
        })
    }

    // ✅ setupPasswordToggle has been now working 
    // Helper to toggle password visibility using Boxicons classes
    function setupPasswordToggle(inputField, toggleBtn, eyeIcon) {
        toggleBtn.addEventListener('click', function() {
            if (toggleBtn.disabled) return;
            if (inputField.type === 'password') {
                inputField.type = 'text';
                eyeIcon.classList.remove('bx-show');
                eyeIcon.classList.add('bx-hide');
                toggleBtn.style.color = '#0891b2';
            } else {
                inputField.type = 'password';
                eyeIcon.classList.remove('bx-hide');
                eyeIcon.classList.add('bx-show');
                toggleBtn.style.color = '#94a3b8';
            }
        });
    }

    if (passwordInput && togglePasswordBtn && eyeIconPwd) {
        setupPasswordToggle(passwordInput, togglePasswordBtn, eyeIconPwd);
    }

    if (confirmPasswordInput && toggleConfirmBtn && eyeIconConfirm) {
        setupPasswordToggle(confirmPasswordInput, toggleConfirmBtn, eyeIconConfirm);
    }

    function updateRequirementStatus(element, isValid) {
        if (isValid) {
            element.classList.add('valid');
        } else {
            element.classList.remove('valid');
        }
    }

    function validateForm() {
        const userId = userIdInput.value;
        const password = passwordInput.value;

        // User ID Criteria is now working ✅
        // User ID Criteria
        const isIdLenValid = userId.length >= 5;
        const isIdNoSpaceValid = userId.length > 0 && !/\s/.test(userId);

        updateRequirementStatus(reqIdLen, isIdLenValid);
        updateRequirementStatus(reIdNoSpace, isIdNoSpaceValid);

        const userIdAllMet = isIdLenValid && isIdNoSpaceValid;

        // Password Criteria is now working ✅
        // Password criteria
        const isPwdLenValid = password.length >= 8;
        const isPwdUpperValid = /[A-Z]/.test(password);
        const isPwdNumValid = /[0-9]/.test(password);
        const isPwdSpecialValid = /[#!&%_-]/.test(password);

        updateRequirementStatus(reqPwdLen, isPwdLenValid);
        updateRequirementStatus(reqPwdUpper, isPwdUpperValid);
        updateRequirementStatus(reqPwdNum, isPwdNumValid);
        updateRequirementStatus(reqPwdSpecial, isPwdSpecialValid);

        const passwordAllMet = isPwdLenValid && isPwdUpperValid && isPwdNumValid && isPwdSpecialValid;

        // Enable/Disbale Confirm Password based on the requirement fullfillment
        if (userIdAllMet &&passwordAllMet) {
            confirmPasswordInput.disabled = false;
            confirmPasswordInput.placeholder = 'Re-type your password';
            toggleConfirmBtn.disabled = false;
        } else {
            confirmPasswordInput.disabled = true;
            confirmPasswordInput.value = '';
            confirmPasswordInput.placeholder = 'Complete the requirement first...';
            toggleConfirmBtn.disabled = true;
        }

        // Confirm Password matching login & red/green styling
        const confirmPassword  = confirmPasswordInput.value;
        const passwordMatch = confirmPassword !== '' && confirmPassword === password;

        if (confirmPassword !== '') {
            if (passwordMatch) {
                confirmPasswordInput.style.borderColor = '#00A300';
                confirmPasswordInput.style.color = '#00A300';
                matchError.classList.remove('visible');
            } else {
                confirmPasswordInput.style.borderColor = '#D10000';
                confirmPasswordInput.style.color = '#D10000';
                matchError.classList.add('visible');
            }
        } else {
            confirmPasswordInput.style.borderColor = '#334155';
            confirmPasswordInput.style.color = '#ffffff';
            matchError.classList.remove('visible');
        }

        // Submit Button activation
        if (userIdAllMet && passwordAllMet && passwordMatch) {
            submitBtn.disabled = false;
            submitBtn.classList.add('active');
        } else {
            submitBtn.disabled = true;
            submitBtn.classList.remove('active');
        }
    }

    // auth.js is shared by several pages; only signup2 has these validation fields.
    if (userIdInput && passwordInput && confirmPasswordInput) {
        userIdInput.addEventListener('input', validateForm);
        passwordInput.addEventListener('input', validateForm);
        confirmPasswordInput.addEventListener('input', validateForm);
    }

    // Element look ups for Signup2 Modal active state
    const signupForm = document.getElementById('signup-form');
    const modal = document.getElementById('custom-modal');
    const modalMessage = document.getElementById('modal-msg-text');
    const modalFields = document.getElementById('modal-fields');
    const modalUsername = document.getElementById('modal-username');
    const modalPassword = document.getElementById('modal-password');
    const modalStatus = document.getElementById('modal-status');
    const modalButtons = document.getElementById('modal-buttons');

    if (signupForm && modal) {
        let saving = false;

        function showModal(message, actions = []) {
            modalMessage.textContent = message;
            modalFields.hidden = true;
            modalStatus.replaceChildren();
            modalButtons.replaceChildren();

            actions.forEach(({label, onClick, className = 'modal-btn-primary'}) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `modal-btn ${className}`;
                button.textContent = label;
                button.addEventListener('click', onClick);
                modalButtons.appendChild(button);
            });

            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
        }

        function showLoading(message) {
            showModal(message);
            const spinner = document.createElement('span');
            spinner.className = 'modal-spinner';
            spinner.setAttribute('aria-hidden', 'true');
            modalStatus.appendChild(spinner);
        }

        function goWithLoading(message, destination) {
            showLoading(message);
            window.setTimeout(() => {
                window.location.href = destination;
            }, 1200);
        }

        function showCredentialEntry() {
            showModal('Re-Enter username and password for the account login confirmation');
            modalFields.hidden = false;
            modalUsername.value = '';
            modalPassword.value = '';

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'modal-btn modal-btn-primary';
            saveButton.textContent = 'Save';
            saveButton.addEventListener('click', saveCredentials);
            modalButtons.appendChild(saveButton);

            modalUsername.focus();
        }

        function showSaveError(message) {
            showModal(message, [
                {
                    label: 'Try Again',
                    onClick: showCredentialEntry
                }
            ]);

            /* modalMessage.textContent = 'Could not save the account information';
            modalFields.hidden = false;
            modalStatus.textContent = message;
            modalButtons.replaceChildren();

            const retryButton = document.createElement('button');
            retryButton.type = 'button';
            retryButton.className = 'modal-btn modal-btn-primary';
            retryButton.textContent = 'Try Again';
            retryButton.addEventListener('click', saveCredentials);
            modalButtons.appendChild(retryButton); */
        }

        function showSaveConfirmation() {
            showModal('Signup flow complete (preview only). Your account was not saved. Continue?');

            const check = document.createElement('span');
            check.className = 'modal-success-check';
            check.textContent = '✓';
            check.setAttribute('aria-label', 'Signup preview complete; account not saved');
            modalStatus.appendChild(check);

            addModalButton('Yes', () => {
                window.location.href = '/src/frontend/pages/dashboard.html';
            });

            addModalButton('No', () => {
                showModal('Do you want to exit?', [
                    {
                        label: 'Yes',
                        onClick: () => {
                            sessionStorage.removeItem('signup-profile');
                            window.location.href = '/src/frontend/index.html';
                        }
                    },
                    {
                        label: 'No',
                        onClick: () => {
                            window.location.href = '/src/frontend/pages/dashboard.html';
                        }
                    }
                ]);
            });
        }

        function addModalButton(label, onClick) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'modal-btn modal-btn-primary';
            button.textContent = label;
            button.addEventListener('click', onClick);
            modalButtons.appendChild(button);
        }

        function saveCredentials() {
            const username = modalUsername.value.trim();
            const password = modalPassword.value;

            if (!username || !password || saving){
                return;
            }

            if (
                username !== userIdInput.value.trim()
                || password !== passwordInput.value
            ) {
                showSaveError('Re-enter the same username and password used in the signup form.');
                return;
            }

            saving = true;
            showLoading('Checking signup credentials...');
            modalPassword.value = '';
            window.setTimeout(() => {
                saving = false;
                showSaveConfirmation();
            }, 1200);
        }

        /* function checkCredentialFields() {
            if (modalUsername.value.trim() && modalPassword.value) {
                saveCredentials();
            }
        }

        modalUsername.addEventListener('input', checkCredentialFields);
        modalPassword.addEventListener('input', checkCredentialFields); */

        signupForm.addEventListener('submit', (event) => {
            event.preventDefault();

            showModal('Do you want to save these POS login credentials?', [
                {
                    label: 'No',
                    className: 'modal-btn-secondary',
                    onClick: () => {
                        showModal('Error: account information was not saved.', [
                            {
                                label: 'Okay',
                                onClick: () => {
                                    goWithLoading('Loading...', '/src/frontend/index.html');
                                }
                            }
                        ]);
                    }
                },
                {
                    label: 'Yes',
                    onClick: () => {
                        showModal('Do you want to go back to the signup form?', [
                            {
                                label: 'Yes',
                                onClick: () => {
                                    window.location.href = '/src/frontend/pages/signup.html';
                                }
                            },
                            {
                                label: 'No',
                                onClick: showCredentialEntry
                            }
                        ]);
                    }
                }
            ]);
        });
    }

    // Login page placeholder while backend integration is disconnected.
    const loginForm = document.querySelector('.login-container form');
    const loginModal = document.getElementById('custom-modal');
    const loginModalMessage = document.getElementById('modal-msg-text');
    const loginModalButtons = document.getElementById('modal-btn-container');

    if (loginForm && loginModal && loginModalMessage && loginModalButtons) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const submitButton = loginForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;

            loginModalMessage.textContent = 'Backend is disconnected. Login is temporarily unavailable.';
            loginModalButtons.replaceChildren();

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'modal-btn modal-btn-primary';
            closeButton.textContent = 'Close';
            closeButton.addEventListener('click', () => {
                loginModal.classList.remove('active');
            });
            loginModalButtons.appendChild(closeButton);
            loginModal.classList.add('active');
            submitButton.disabled = false;
        });
    }
});