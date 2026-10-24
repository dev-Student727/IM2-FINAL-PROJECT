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

    setupPasswordToggle(passwordInput, togglePasswordBtn, eyeIconPwd);
    setupPasswordToggle(confirmPasswordInput, toggleConfirmBtn, eyeIconConfirm);

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
            toggleConfirmBtn.disabled = false;
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

    userIdInput.addEventListener('input', validateForm);
    passwordInput.addEventListener('input', validateForm);
    confirmPasswordInput.addEventListener('input', validateForm);

    document.getElementById('signup-form').addEventListener('submit', function(e) {
        e.preventDefault();
        window.location.href = "index.html"
    });
});