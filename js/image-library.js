/* Full built-in image library: one small gzip request, no per-image network waits. */
(function () {
    'use strict';
    var script = document.currentScript;
    var packedUrl = script.getAttribute('data-bundle');
    var fallbackUrl = script.getAttribute('data-fallback');
    var entries = Object.create(null);
    var sources = Object.create(null);
    var api = window.ZBLL_IMAGE_LIBRARY = { state: 'loading', count: 0, source: source, has: has };

    function key(path) {
        return typeof path === 'string' ? path.replace(/^\.\//, '').split(/[?#]/)[0] : '';
    }
    function has(path) { return Object.prototype.hasOwnProperty.call(entries, key(path)); }
    function source(path) {
        var name = key(path);
        if (!has(path)) return path;
        if (!sources[name]) {
            var item = entries[name];
            // Data URLs survive the existing sessionStorage render snapshot across reloads.
            // Do not write these display-only URLs into workspace or export data.
            sources[name] = item[0] === 'image/svg+xml'
                ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(item[1])
                : 'data:' + item[0] + ';base64,' + item[1];
        }
        return sources[name];
    }
    async function download(url, compressed) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timer;
        try {
            return await Promise.race([
                (async function () {
                    var response = await fetch(url, { signal: controller ? controller.signal : undefined });
                    if (!response.ok) throw new Error('Image library HTTP ' + response.status);
                    var bytes = new Uint8Array(await response.arrayBuffer());
                    // Some hosts transparently decompress .gz; handle both encodings.
                    var gzip = bytes[0] === 31 && bytes[1] === 139;
                    var text;
                    if (compressed && gzip) {
                        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
                        text = await new Response(stream).text();
                    } else text = new TextDecoder('utf-8').decode(bytes);
                    var data = JSON.parse(text);
                    if (data.version !== 1 || !data.images || !Object.keys(data.images).length) throw new Error('Invalid image library');
                    Object.keys(data.images).forEach(function (name) {
                        var image = data.images[name];
                        if (!Array.isArray(image) || image.length !== 2 || !/^image\/(svg\+xml|png|jpeg|gif|webp)$/.test(image[0]) || typeof image[1] !== 'string') {
                            throw new Error('Invalid image entry: ' + name);
                        }
                    });
                    return data.images;
                })(),
                new Promise(function (_, reject) {
                    timer = window.setTimeout(function () {
                        if (controller) controller.abort();
                        reject(new Error('Image library timeout'));
                    }, 8000);
                })
            ]);
        } finally { window.clearTimeout(timer); }
    }
    api.ready = (async function () {
        try {
            if (typeof DecompressionStream === 'function') {
                try { entries = await download(packedUrl, true); }
                catch (_) { entries = await download(fallbackUrl, false); }
            } else entries = await download(fallbackUrl, false);
            api.count = Object.keys(entries).length;
            api.state = 'ready';
            return true;
        } catch (error) {
            // The original image files remain available; don't make the whole app unusable.
            api.state = 'fallback';
            console.warn('Image library unavailable; using individual images.', error);
            return false;
        }
    })();
})();
