'use strict';

// Progressive enhancement. Content is never hidden by CSS. Every page owns a
// matchMedia context, observer and event scope; navigation reverts all of them.
(() => {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  let media = null;
  let events = null;
  let visibility = null;
  let refreshTimer = null;
  let transient = [];
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clear() {
    clearTimeout(refreshTimer);
    visibility?.disconnect();
    visibility = null;
    events?.abort();
    events = null;
    media?.revert();
    media = null;
    transient.forEach(tween => tween.revert());
    transient = [];
    // Refresh must not restore a cached scroll offset from a replaced SPA page.
    // Invalidate GSAP's scroller cache as well as reverting each page context.
    ScrollTrigger.clearScrollMemory();
  }
  function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 100);
  }
  function mount(root, { entrance = true } = {}) {
    clear();
    if (!root || !root.isConnected) return;
    // A programmatic route reset can precede the native scroll event. Seed the
    // public scroller setter with the actual viewport before refresh's
    // horizontal setter can reuse the previous page's cached vertical value.
    ScrollTrigger.getScrollFunc(window)(window.scrollY);
    media = gsap.matchMedia();
    events = new AbortController();
    root.querySelectorAll('img').forEach(img => {
      if (!img.complete) img.addEventListener('load', refresh, { once: true, signal: events.signal });
    });
    // Gallery scrolling stays native on touch / trackpad, no scroll hijacking.
    const rail = root.querySelector('.release-scroller');
    const meter = root.querySelector('.rail-meter>span');
    if (rail && meter) {
      let distance = 0;
      let visibleFraction = 1;
      const update = () => {
        const progress = distance ? gsap.utils.clamp(0, 1, rail.scrollLeft / distance) : 0;
        meter.style.transform = `scaleX(${visibleFraction + progress * (1 - visibleFraction)})`;
      };
      const measure = () => {
        distance = Math.max(0, rail.scrollWidth - rail.clientWidth);
        visibleFraction = rail.clientWidth / Math.max(1, rail.scrollWidth);
        update();
      };
      rail.addEventListener('scroll', update, { passive: true, signal: events.signal });
      window.addEventListener('resize', measure, { passive: true, signal: events.signal });
      measure();
    }
    media.add('(prefers-reduced-motion: no-preference)', () => {
      if (document.hidden) return;
      const localEvents = new AbortController();
      const stage = root.querySelector('.exhibition-stage');
      const artwork = root.querySelector('.stage-art');
      if (stage && artwork) {
        if (entrance) {
          const intro = gsap.timeline({ defaults: { duration: .8, ease: 'power3.out' } });
          intro.addLabel('reveal', .08)
            .from(stage.querySelector('.stage-topline'), { y: 8, autoAlpha: 0, duration: .5 }, 0)
            .from(stage.querySelector('.stage-caption'), { y: 9, autoAlpha: 0, duration: .55 }, 'reveal')
            .from(stage.querySelectorAll('.stage-heading h1>span'), { y: 28, skewY: 2, autoAlpha: 0, stagger: .09 }, 'reveal')
            .from(stage.querySelectorAll('.sound-glyph i'), { scaleY: .15, stagger: .035, duration: .5, ease: 'back.out(1.5)' }, 'reveal+=.12')
            .from(stage.querySelector('.stage-scenery'), { y: 22, autoAlpha: 0, duration: 1.1 }, 'reveal+=.14')
            .from(artwork.querySelector('.art-stone'), { x: -12, rotation: -3, duration: 1.1 }, 'reveal+=.14')
            .from(artwork.querySelectorAll('.art-cloth-back,.art-cloth-front'), { x: 16, autoAlpha: 0, stagger: .06, duration: 1 }, 'reveal+=.2')
            .from(stage.querySelector('.stage-bottom'), { y: 15, autoAlpha: 0, duration: .6 }, 'reveal+=.38');
        }
        // Scroll moves outer layers, leaving vinyl rotation owned by playback.
        gsap.fromTo(artwork, { y: 0, rotation: -.6 }, {
          y: 24, rotation: .9, transformOrigin: '50% 55%', ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top top', end: 'bottom top', scrub: .7 }
        });
        gsap.fromTo(artwork.querySelector('.art-cloth-front'), { y: 0 }, {
          y: 13, ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top top', end: 'bottom top', scrub: 1 }
        });
        // The measurement ring, fragments and annotation marks follow the
        // scroll narrative at a deliberately smaller amplitude than the
        // sculpture. This creates a calibrated exhibition object rather than
        // a flat hero that simply moves vertically.
        const measure = artwork.querySelector('.art-measure');
        if (measure) gsap.fromTo(measure, { rotation: -1.5, opacity: .56 }, {
          rotation: 1.5, opacity: .92, transformOrigin: '48.125% 47.414%', ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top top', end: 'bottom top', scrub: .85 }
        });
        const fragments = artwork.querySelector('.art-fragment');
        if (fragments) gsap.fromTo(fragments, { y: 0, rotation: -1 }, {
          y: -9, rotation: 1, transformOrigin: '48.125% 47.414%', ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top 92%', end: 'bottom top', scrub: .9 }
        });
        const pulseMarks = artwork.querySelectorAll('.art-measure circle,.art-measure path');
        if (pulseMarks.length) gsap.fromTo(pulseMarks, { opacity: .06 }, {
          opacity: (index, target) => Number(target.getAttribute('opacity') || 1),
          stagger: { each: .008, from: 'center' }, ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top 78%', end: 'center 28%', scrub: .65 }
        });
        gsap.fromTo(stage.querySelectorAll('.stage-side-note,.stage-art-note'), { opacity: .5, y: 4 }, {
          opacity: 1, y: 0, ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top 75%', end: 'center 35%', scrub: .6 }
        });
        const disc = artwork.querySelector('.art-vinyl-spin');
        const pulse = artwork.querySelector('.art-pulse');
        const spin = disc ? gsap.to(disc, { rotation: 360, duration: 24, ease: 'none', repeat: -1, paused: true, transformOrigin: '50% 50%' }) : null;
        const beat = pulse ? gsap.fromTo(pulse, { opacity: .15, scale: .98 }, {
          opacity: .7, scale: 1.035, duration: 1.15, repeat: -1, yoyo: true,
          ease: 'sine.inOut', paused: true, transformOrigin: '50% 50%'
        }) : null;
        let onScreen = false;
        const sync = () => {
          const playing = window.HipkopPlayer?.snapshot().status === 'playing';
          const active = playing && onScreen && !document.hidden;
          if (active) { spin?.play(); beat?.play(); }
          else { spin?.pause(); beat?.pause(); }
          if (!playing && pulse) gsap.set(pulse, { opacity: 0 });
        };
        visibility = new IntersectionObserver(([entry]) => {
          onScreen = entry.isIntersecting;
          sync();
        }, { threshold: .05 });
        visibility.observe(stage);
        window.addEventListener('hipkop:player', sync, { signal: localEvents.signal });
        sync();
        // Pointer tilt is desktop-only; one quickTo per property, bounded to 3°.
        // Mobile keeps native touch scrolling; no device orientation permission.
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          const composition = stage.querySelector('.stage-composition');
          const object = artwork.querySelector('.exhibition-art');
          if (composition && object) {
            let bounds;
            const xTo = gsap.quickTo(object, 'rotationX', { duration: .75, ease: 'power3.out' });
            const yTo = gsap.quickTo(object, 'rotationY', { duration: .75, ease: 'power3.out' });
            const limit = gsap.utils.clamp(-1, 1);
            const angle = gsap.utils.mapRange(-1, 1, -3, 3);
            gsap.set(object, { transformPerspective: 800 });
            composition.addEventListener('pointerenter', () => { bounds = composition.getBoundingClientRect(); }, { signal: localEvents.signal });
            composition.addEventListener('pointermove', event => {
              if (!bounds || event.pointerType !== 'mouse') return;
              yTo(angle(limit((event.clientX - bounds.left) / bounds.width * 2 - 1)));
              xTo(-angle(limit((event.clientY - bounds.top) / bounds.height * 2 - 1)));
            }, { signal: localEvents.signal });
            composition.addEventListener('pointerleave', () => { xTo(0); yTo(0); }, { signal: localEvents.signal });
          }
        }
      } else if (entrance) {
        const head = root.querySelector('.page-title,.detail-hero,.artist-hero');
        if (head) gsap.from(head, { y: 12, autoAlpha: 0, duration: .5, ease: 'power3.out' });
      }
      const podium = root.querySelector('.chart-podium');
      if (podium && entrance) gsap.from(podium.querySelectorAll('.podium-record'), {
        y: 18, rotationY: -5, autoAlpha: 0, duration: .65, stagger: .09, ease: 'power3.out'
      });
      const wall = root.querySelector('.wall-timeline');
      if (wall && entrance) gsap.from(wall.querySelectorAll('.wall-post'), {
        x: -9, duration: .5, stagger: .065, ease: 'power2.out', immediateRender: false,
        scrollTrigger: { trigger: wall, start: 'top 93%', once: true }
      });
      // Only a handful of sections animate, not hundreds of catalog rows.
      root.querySelectorAll('.section:not(.loading-block):not(.collection-section)').forEach(section => {
        gsap.from(section, {
          y: 17, duration: .65, ease: 'power3.out', immediateRender: false,
          scrollTrigger: { trigger: section, start: 'top 94%', once: true }
        });
      });
      const radar = root.querySelector('.radar-section .cards');
      if (radar) gsap.from(radar.querySelectorAll('.card'), {
        y: 16, duration: .75, stagger: .09, ease: 'power3.out', immediateRender: false,
        scrollTrigger: { trigger: radar, start: 'top 92%', once: true }
      });
      const releases = root.querySelector('.release-scroller');
      if (releases) gsap.from(releases.querySelectorAll('.release-card'), {
        y: 18, autoAlpha: 0, duration: .7, stagger: .065, ease: 'power3.out',
        immediateRender: false,
        scrollTrigger: { trigger: releases, start: 'top 94%', once: true }
      });
      const top10 = root.querySelector('.top10-section .rank-list');
      if (top10) gsap.from(top10.querySelectorAll('.rank'), {
        x: -10, autoAlpha: 0, duration: .55, stagger: .045, ease: 'power2.out',
        immediateRender: false,
        scrollTrigger: { trigger: top10, start: 'top 92%', once: true }
      });
      refresh();
      return () => { localEvents.abort(); visibility?.disconnect(); };
    }, root);
  }
  function smallReveal(nodes, vars = {}) {
    if (!nodes || reduced() || document.hidden) return;
    transient = transient.filter(tween => tween.isActive());
    transient.push(gsap.fromTo(nodes, { opacity: .55, y: 7 }, {
      opacity: 1, y: 0, duration: .38, ease: 'power2.out',
      overwrite: true, clearProps: 'opacity,transform', ...vars
    }));
  }
  window.HipkopMotion = {
    clear, mount,
    swapHero: node => smallReveal(node),
    pick: root => smallReveal(root.querySelector('.pick-card')),
    sheet: card => smallReveal(card, { duration: .3 }),
    results: root => {
      const nodes = root.querySelectorAll('.podium-record,.card,.wall-post,.artist-result');
      smallReveal(nodes.length ? Array.from(nodes).slice(0, 10) : root, { stagger: .025, duration: .35 });
      refresh();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clear();
    else mount(document.querySelector('#view'), { entrance: false });
  });
  const pressable = '.stage-play,.stage-open,.cta,.chip,.ghost,.tabbar button,.section-action';
  document.addEventListener('pointerdown', event => {
    if (reduced() || event.button !== 0 || !(event.target instanceof Element)) return;
    const target = event.target.closest(pressable);
    if (target) gsap.to(target, { scale: .97, duration: .12, overwrite: 'auto' });
  });
  function release() {
    if (reduced()) return;
    gsap.to(document.querySelectorAll(pressable), {
      scale: 1, duration: .3, ease: 'power2.out', overwrite: 'auto', clearProps: 'transform'
    });
  }
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
  document.fonts?.ready.then(refresh);
})();
