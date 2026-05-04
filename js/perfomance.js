(() => {
    const head = document.head;

    const ensurePreconnect = (origin) => {
        if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = origin;
            link.crossOrigin = 'anonymous';
            head.appendChild(link);
        }
        if (!document.querySelector(`link[rel="dns-prefetch"][href="${origin}"]`)) {
            const dnsPrefetch = document.createElement('link');
            dnsPrefetch.rel = 'dns-prefetch';
            dnsPrefetch.href = origin;
            head.appendChild(dnsPrefetch);
        }
    };

    ensurePreconnect('https://unpkg.com');

    const preloadStylesheet = (href, crossOrigin) => {
        if (document.querySelector(`link[data-preload-href="${href}"]`)) return;
        const preload = document.createElement('link');
        preload.rel = 'preload';
        preload.as = 'style';
        preload.href = href;
        preload.dataset.preloadHref = href;
        if (crossOrigin) preload.crossOrigin = crossOrigin;
        head.appendChild(preload);
    };

    const setupAsyncStyles = () => {
        document.querySelectorAll('link[rel="stylesheet"][data-async]').forEach((link) => {
            if (link.dataset.asyncApplied === 'true') return;
            const originalMedia =
                link.getAttribute('data-original-media') ||
                link.dataset.originalMedia ||
                (link.media && link.media !== 'print' ? link.media : 'all');
            link.dataset.originalMedia = originalMedia;
            if (link.media !== 'print') {
                link.media = 'print';
            }
            if (!link.dataset.asyncOnloadBound) {
                link.addEventListener('load', () => {
                    link.media = link.dataset.originalMedia || 'all';
                }, { once: true });
                link.dataset.asyncOnloadBound = 'true';
            }
            link.dataset.asyncApplied = 'true';
        });
    };

    document.addEventListener('DOMContentLoaded', () => {
        setupAsyncStyles();

        const images = document.querySelectorAll('img:not([data-lazy="false"])');
        const supportsNativeLazy = 'loading' in HTMLImageElement.prototype;

        if (supportsNativeLazy) {
            images.forEach((img, index) => {
                if (!img.hasAttribute('loading')) {
                    img.loading = index < 2 ? 'eager' : 'lazy';
                }
                if (!img.hasAttribute('decoding')) {
                    img.decoding = 'async';
                }
                if (!img.hasAttribute('fetchpriority') && index < 2) {
                    img.fetchPriority = 'high';
                }
            });
        } else if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries, obs) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                        }
                        img.decoding = 'async';
                        obs.unobserve(img);
                    }
                });
            }, { rootMargin: '300px' });

            images.forEach((img, index) => {
                if (!img.dataset.src) {
                    img.dataset.src = img.src;
                    if (index > 1) {
                        img.removeAttribute('src');
                    }
                }
                observer.observe(img);
            });
        }
    });

    window.addEventListener('load', () => {
        document.querySelectorAll('link[rel="stylesheet"][data-async]').forEach((link) => {
            link.media = link.dataset.originalMedia || 'all';
        });
    });
})();

