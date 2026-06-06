// Botpress webchat — the family health assistant.
// Floating bubble, bottom-right, themed to match the dashboard's teal palette.
// Config (botId/clientId) comes from the shareable webchat link.
(function () {
  var BOT = {
    botId: 'b2acf370-7227-431b-8c22-a08d21eb05e5',
    clientId: '8c5d556d-ada0-4ebf-8c0c-5d481e82753e',
    configuration: {
      botName: 'Family Health Assistant',
      composerPlaceholder: 'Ask about the family…',
      color: '#4a9d8e',     // --teal
      variant: 'solid',
      themeMode: 'light',
      radius: 4,
    },
  };

  var inject = document.createElement('script');
  inject.src = 'https://cdn.botpress.cloud/webchat/v3.6/inject.js';
  inject.defer = true;
  inject.onload = function () {
    if (window.botpress && typeof window.botpress.init === 'function') {
      window.botpress.init(BOT);
    }
  };
  document.head.appendChild(inject);
})();
