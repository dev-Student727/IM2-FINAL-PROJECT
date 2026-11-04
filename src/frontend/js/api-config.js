(() => {
    const hostname = window.location.hostname || '127.0.0.1';
    const isLocalHost =
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
        /^10(?:\.\d{1,3}){3}$/.test(hostname) ||
        /^192\.168(?:\.\d{1,3}){2}$/.test(hostname) ||
        /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(hostname);

    window.MRB_API_BASE_URL = isLocalHost
        ? `http://${hostname}:5000/api`
        : 'https://point-of-sales-beta.onrender.com/api';
})();
