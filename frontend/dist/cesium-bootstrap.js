// Configurată înaintea încărcării bibliotecii. Nicio resursă Cesium nu vine de pe CDN.
window.CESIUM_BASE_URL = new URL('./vendor/cesium/', document.baseURI).href;
