document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('actionBtn');
    const title = document.querySelector('h1');

    // Simple interactivity to confirm JS is running
    btn.addEventListener('click', () => {
        const originalText = btn.textContent;
        btn.textContent = 'System Active 🚀';
        btn.style.transform = 'scale(0.95)';

        setTimeout(() => {
            btn.style.transform = 'scale(1.05)';
        }, 150);

        // Add a temporary glow effect to the title
        title.style.textShadow = '0 0 20px rgba(0, 210, 255, 0.8)';
        setTimeout(() => {
            title.style.textShadow = 'none';
        }, 1000);

        console.log('Core Kuiper: Interaction detected. JavaScript is operational.');
    });

    // Console greeting
    console.log('%c Core Kuiper Initialized ', 'background: #00d2ff; color: #000; font-weight: bold; padding: 4px; border-radius: 4px;');
});
