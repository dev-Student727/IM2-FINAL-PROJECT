const AUTH_API_BASE = window.MRB_API_BASE_URL;
const FRONTEND_ROOT_URL = new URL('../', document.currentScript.src);
const SIGNUP_STEP_URL = new URL('pages/funnel/signup2.html', FRONTEND_ROOT_URL);
const SIGNUP_PAGE_URL = new URL('pages/signup.html', FRONTEND_ROOT_URL);
const DASHBOARD_PAGE_URL = new URL('pages/dashboard.html', FRONTEND_ROOT_URL);
const WELCOME_PAGE_URL = new URL('index.html', FRONTEND_ROOT_URL);

async function authApiRequest(path, options = {}) {
    let response;
    try {
        response = await fetch(`${AUTH_API_BASE}${path}`, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error(
                `Backend API is unreachable at ${AUTH_API_BASE}. Verify the Render service URL and its CORS settings.`
            );
        }
        throw error;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || `Request failed (${response.status}).`);
    }
    return result;
}

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
            window.location.href = SIGNUP_STEP_URL.href;
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
            showModal('Account saved to the database and login successful. Continue to the POS?');

            const check = document.createElement('span');
            check.className = 'modal-success-check';
            check.textContent = '✓';
            check.setAttribute('aria-label', 'Account saved and signed in');
            modalStatus.appendChild(check);

            addModalButton('Continue', () => {
                sessionStorage.removeItem('signup-profile');
                window.location.href = DASHBOARD_PAGE_URL.href;
            });

            addModalButton('Not now', async () => {
                try {
                    await authApiRequest('/auth/logout', { method: 'POST' });
                    sessionStorage.removeItem('signup-profile');
                    window.location.href = WELCOME_PAGE_URL.href;
                } catch (error) {
                    showSaveError(error.message);
                }
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

        async function saveCredentials() {
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
            showLoading('Saving account and signing in...');
            const profileText = sessionStorage.getItem('signup-profile');
            let profile;
            try {
                profile = profileText ? JSON.parse(profileText) : null;
                if (!profile || !profile.name || !profile.email || !profile.contact_number) {
                    throw new Error('Signup details are missing. Return to the signup form and try again.');
                }
                await authApiRequest('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({
                        ...profile,
                        user_id: username,
                        password
                    })
                });
                modalPassword.value = '';
                saving = false;
                showSaveConfirmation();
            } catch (error) {
                saving = false;
                modalPassword.value = '';
                showSaveError(error.message);
            }
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
                                    goWithLoading('Returning to welcome page...', WELCOME_PAGE_URL.href);
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
                                    window.location.href = SIGNUP_PAGE_URL.href;
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

    // Login uses the Flask API; the API keeps the authenticated session in an HTTP-only cookie.
    const loginForm = document.querySelector('.login-container form');
    const loginModal = document.getElementById('custom-modal');
    const loginModalMessage = document.getElementById('modal-msg-text');
    const loginModalButtons = document.getElementById('modal-btn-container');

    if (loginForm && loginModal && loginModalMessage && loginModalButtons) {
        const rememberCheckbox = loginForm.querySelector('#remember-me');
        const userIdInput = loginForm.querySelector('#user-id');
        const passwordInput = loginForm.querySelector('#password');
        const accountUserIds = loginForm.querySelector('#account-user-ids');
        const loginStatus = document.getElementById('login-status');
        const rememberHint = document.getElementById('remember-hint');
        const savedPasswordCredentialsAvailable =
            navigator.credentials && typeof window.PasswordCredential === 'function';

        function setCredentialAutofill(enabled) {
            userIdInput.autocomplete = enabled ? 'username' : 'off';
            passwordInput.autocomplete = enabled ? 'current-password' : 'off';
            loginForm.autocomplete = enabled ? 'on' : 'off';
        }

        function clearLoginFields() {
            passwordInput.value = '';
        }

        clearLoginFields();
        setCredentialAutofill(false);
        authApiRequest('/auth/user-ids')
            .then(({ user_ids: userIds }) => {
                accountUserIds.replaceChildren();
                userIds.forEach(userId => {
                    const option = document.createElement('option');
                    option.value = userId;
                    accountUserIds.appendChild(option);
                });
                if (!userIdInput.value && userIds.length === 1) {
                    userIdInput.value = userIds[0];
                }
            })
            .catch(error => {
                console.error('Could not load account IDs for login:', error);
                loginStatus.textContent = 'Could not load the saved user ID. Enter it manually.';
            });

        rememberCheckbox.addEventListener('change', async () => {
            rememberHint.textContent = '';
            if (!rememberCheckbox.checked) {
                clearLoginFields();
                setCredentialAutofill(false);
                return;
            }

            setCredentialAutofill(true);
            if (!savedPasswordCredentialsAvailable) {
                rememberHint.textContent =
                    'Use your browser password manager. Access on other devices depends on its sync settings.';
                return;
            }

            try {
                const credential = await navigator.credentials.get({
                    password: true,
                    mediation: 'silent'
                });
                if (credential?.type === 'password') {
                    userIdInput.value = credential.id;
                    passwordInput.value = credential.password;
                } else {
                    rememberHint.textContent =
                        'No saved login was found. Sign in with this checked to save it in your browser password manager.';
                }
            } catch (error) {
                console.error('Could not retrieve saved browser credentials:', error);
                rememberHint.textContent =
                    'Could not retrieve saved credentials. Enter them manually or check your browser password manager.';
            }
        });

        authApiRequest('/auth/me')
            .then(({ user }) => {
                if (user) window.location.href = DASHBOARD_PAGE_URL.href;
            })
            .catch(error => {
                console.warn('Could not check the existing login session:', error);
            });

        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = loginForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            loginModalMessage.textContent = 'Signing in…';
            loginModalButtons.replaceChildren();

            loginModal.classList.add('active');
            try {
                await authApiRequest('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: userIdInput.value.trim(),
                        password: passwordInput.value,
                        remember: rememberCheckbox.checked
                    })
                });

                if (rememberCheckbox.checked) {
                    if (savedPasswordCredentialsAvailable) {
                        try {
                            await navigator.credentials.store(new window.PasswordCredential(loginForm));
                            rememberHint.textContent = 'Login saved in your browser password manager.';
                        } catch (error) {
                            console.error('Could not save credentials in the browser password manager:', error);
                            rememberHint.textContent =
                                'Login succeeded, but your browser could not save the credentials.';
                        }
                    } else {
                        rememberHint.textContent =
                            'Login succeeded. Use your browser password manager; other-device access depends on its sync settings.';
                    }
                }

                loginModalMessage.textContent = 'Login successful.';
                const success = document.createElement('span');
                success.className = 'modal-success-check';
                success.textContent = '✓';
                loginModalButtons.appendChild(success);
                window.setTimeout(() => {
                    window.location.href = DASHBOARD_PAGE_URL.href;
                }, 700);
            } catch (error) {
                loginModalMessage.textContent = error.message;
                const closeButton = document.createElement('button');
                closeButton.type = 'button';
                closeButton.className = 'modal-btn modal-btn-primary';
                closeButton.textContent = 'Close';
                closeButton.addEventListener('click', () => {
                    loginModal.classList.remove('active');
                });
                loginModalButtons.appendChild(closeButton);
            } finally {
                submitButton.disabled = false;
            }
        });
    }
});