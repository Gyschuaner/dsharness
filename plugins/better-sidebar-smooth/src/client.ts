/**
 * dsh-better-sidebar-smooth — client half (browser bundle).
 * build: 1
 *
 * Served verbatim at /plugins/dsh-better-sidebar-smooth/client.js by the
 * client module system; a classic script that registers a factory on
 * window.__ModuleLoader__. The factory injects one <style> tag — it
 * requires no shell seed words.
 *
 * Why (dsh-better-sidebar 0.12.3, see repo docs + upstream issue):
 * the plugin's sheet pairs
 *   #root { margin-right: var(--dsh-sidebar-width);
 *           transition: margin-right 300ms cubic-bezier(.4,0,.2,1) }
 * with the state rule
 *   body[data-dsh-sidebar-collapsed]
 *     [data-slot="conversation.session.header"] > header {
 *       padding-right: 78px }                    /* no transition
 * Opening/closing the side panel flips --dsh-sidebar-width (0<->432px,
 * animated) and the body attribute (padding 78<->28px, INSTANT) in the
 * same commit. The right-aligned "Session log" capsule therefore jumps
 * 50px against the 300ms slide in the first frame. Giving padding-right
 * the same duration and easing makes the two drivers sum into one
 * smooth monotonic motion (closing direction included).
 *
 * TypeScript source compiled to a classic browser script — no JSX or imports.
 */
(function () {
	window.__ModuleLoader__.load({
		id: 'dsh-better-sidebar-smooth',
		factory: function (_require) {
			var module: ClientModule = { exports: {} };

			module.exports.apply = function (_ctx) {
				var style = document.getElementById('bsr-smooth-style') as HTMLStyleElement | null;
				if (!style) style = document.createElement('style');
				style.id = 'bsr-smooth-style';
				style.setAttribute('data-plugin', 'dsh-better-sidebar-smooth');
				style.textContent = [
					/* session header: animate the 78px<->28px padding flip on the
					same clock as the layout shift (shell tokens, with fallbacks
					for older themes). */
					'[data-slot="conversation.session.header"] > header{transition:padding-right var(--ds-transition-duration-slow,300ms) var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1))}',
				].join('');
				if (!style.parentNode) document.head.appendChild(style);
			};
			return module.exports;
		}
	});
})();
