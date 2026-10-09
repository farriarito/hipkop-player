/* HIPKOP — an original layered listening object, drawn locally without image dependencies.
 * Keep the object layers independent: motion.js moves transforms, never SVG filters.
 * stage() creates scoped filter/gradient IDs so multiple instances can safely coexist.
 */
(function (scope) {
  'use strict';
  let serial = 0;
  const f = n => Number(n.toFixed(2));
  const point = (cx, cy, rx, ry, a) => [f(cx + rx * Math.cos(a)), f(cy + ry * Math.sin(a))];
  function random(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function stage() {
    const id = `hipkop-object-${++serial}`;
    const url = key => `url(#${id}-${key})`;
    const noise = random(27319);
    const stone = 'M181 139C223 102 280 84 326 93L338 111 320 118 348 135 332 152 357 163 347 178 369 188 355 205 371 214C378 226 378 252 373 271L354 296 366 309 351 326 357 344 339 352 347 374 326 387 315 411 290 419 268 431C215 437 170 422 140 391 114 364 102 322 106 281 109 236 132 179 181 139Z';
    const stoneInner = 'M204 178C239 152 277 146 313 153L320 166 303 175 325 187 313 203 331 217 321 232 337 242 328 262 336 279 318 294 320 313 306 324 304 346 282 351 270 367C227 379 191 366 167 342 147 316 143 284 152 253 161 224 179 199 204 178Z';
    const stonePath = `${stone} ${stoneInner}`;
    let pits = '';
    for (let i = 0; i < 80; i++) {
      const x = f(90 + noise() * 305), y = f(88 + noise() * 345);
      const r = f(0.35 + Math.pow(noise(), 3) * 3.5);
      pits += `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f(r * (.4 + noise() * .5))}" fill="${i % 5 ? '#655d4c' : '#faf6ea'}" opacity="${f(.12 + noise() * .27)}"/><path d="M${f(x - r)} ${f(y + r * .7)}l${f(r * 1.8)} -.4" stroke="#fff8df" stroke-width=".45" opacity=".3"/>`;
    }
    let ticks = '';
    for (let i = 0; i < 80; i++) {
      const a = i * Math.PI * 2 / 80;
      const p1 = point(308, 275, 239, 221, a);
      const p2 = point(308, 275, i % 10 === 0 ? 250 : i % 5 === 0 ? 246 : 243, i % 10 === 0 ? 232 : i % 5 === 0 ? 228 : 225, a);
      ticks += `<path d="M${p1}L${p2}" opacity="${i % 5 === 0 ? '.55' : '.27'}"/>`;
    }
    let grooves = '';
    for (let i = 0; i < 36; i++) {
      grooves += `<circle r="${f(55 + i * 2.5)}" fill="none" stroke="${i % 4 ? '#747368' : '#e0dacd'}" stroke-width="${i % 4 ? '.35' : '.55'}" opacity="${i % 4 ? '.25' : '.19'}"/>`;
    }
    let textile = '';
    // Thin thread lines lie along the red drape's longitudinal folds.
    for (let i = 0; i < 14; i++) {
      const d = i * 2.4;
      textile += `<path d="M${f(463 + d)} 35C${f(408 + d)} 113 ${f(471 + d)} 134 ${f(407 + d)} 230C${f(378 + d)} 273 ${f(353 + d)} 317 ${f(325 + d)} 370C${f(276 + d)} 432 ${f(229 + d)} 438 ${f(154 + d)} 469C${f(96 + d)} 484 ${f(36 + d)} 477 ${f(-25 + d)} 509" fill="none" stroke="${i % 3 ? '#efa89a' : '#570e11'}" stroke-width=".5" opacity="${i % 3 ? '.07' : '.11'}"/>`;
    }
    const artwork = `<svg viewBox="0 0 640 580" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}-stone" x1="18%" y1="8%" x2="83%" y2="100%"><stop stop-color="#f5eee0"/><stop offset=".24" stop-color="#d6cdbb"/><stop offset=".52" stop-color="#e5dcc7"/><stop offset=".75" stop-color="#a39982"/><stop offset="1" stop-color="#625b4b"/></linearGradient>
        <linearGradient id="${id}-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c7bea8"/><stop offset=".49" stop-color="#8f866f"/><stop offset="1" stop-color="#49473e"/></linearGradient>
        <radialGradient id="${id}-record" cx=".34" cy=".25" r=".83"><stop stop-color="#5d5e55"/><stop offset=".37" stop-color="#272a27"/><stop offset=".69" stop-color="#141917"/><stop offset=".88" stop-color="#44443c"/><stop offset="1" stop-color="#111714"/></radialGradient>
        <linearGradient id="${id}-metal" x1=".06" y1=".01" x2=".93" y2=".94"><stop stop-color="#efeddf"/><stop offset=".16" stop-color="#969c90"/><stop offset=".32" stop-color="#c3c6b7"/><stop offset=".58" stop-color="#59625b"/><stop offset=".82" stop-color="#8b9283"/><stop offset="1" stop-color="#d6d9c8"/></linearGradient>
        <linearGradient id="${id}-red" x1=".07" y1=".04" x2=".81" y2=".89"><stop stop-color="#541014"/><stop offset=".12" stop-color="#b9352b"/><stop offset=".28" stop-color="#db5740"/><stop offset=".47" stop-color="#8d211e"/><stop offset=".66" stop-color="#bf3629"/><stop offset=".8" stop-color="#651816"/><stop offset="1" stop-color="#b72e26"/></linearGradient>
        <linearGradient id="${id}-silk" x1="0" y1="0" x2=".82" y2=".95"><stop stop-color="#f08767"/><stop offset=".17" stop-color="#ca3b2f"/><stop offset=".4" stop-color="#ef6b4d"/><stop offset=".58" stop-color="#971f1c"/><stop offset=".85" stop-color="#d84735"/><stop offset="1" stop-color="#661312"/></linearGradient>
        <linearGradient id="${id}-fold" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#591010" stop-opacity=".8"/><stop offset=".48" stop-color="#ef7960" stop-opacity=".6"/><stop offset="1" stop-color="#691816" stop-opacity="0"/></linearGradient>
        <radialGradient id="${id}-shadow"><stop stop-color="#2d2b24" stop-opacity=".26"/><stop offset=".42" stop-color="#615b4d" stop-opacity=".16"/><stop offset="1" stop-color="#615b4d" stop-opacity="0"/></radialGradient>
        <clipPath id="${id}-stone-mask"><path d="${stonePath}" fill-rule="evenodd"/></clipPath>
        <clipPath id="${id}-cloth-mask"><path d="M467 24C429 105 476 123 447 190 425 242 396 288 361 339 335 381 281 425 192 446 105 467 44 459-30 509L-15 549C60 495 131 514 218 486 303 459 363 416 389 355 418 296 447 256 473 207 513 134 457 109 510 28Z"/></clipPath>
      </defs>
      <g class="art-ground">
        <ellipse cx="321" cy="499" rx="235" ry="48" fill="${url('shadow')}"/>
        <path d="M53 495H585M296 517H451" fill="none" stroke="#787161" stroke-width=".5" opacity=".16"/>
      </g>
      <g class="art-measure" fill="none" stroke="#554e42" stroke-width=".55">
        <ellipse cx="308" cy="275" rx="239" ry="221" opacity=".3"/>
        <ellipse cx="308" cy="275" rx="219" ry="203" opacity=".14"/>
        ${ticks}
        <path d="M43 275H573M308 26V526" stroke-dasharray="2 7" opacity=".24"/>
        <path d="M125 94L501 450M92 430L524 122" opacity=".12"/>
        <path d="M527 121h33v-21M116 453H76v21" opacity=".6"/>
        <circle cx="527" cy="121" r="3"/><circle cx="116" cy="453" r="3"/>
      </g>
      <g class="art-cloth-back">
        <path d="M467 24C429 105 476 123 447 190 425 242 396 288 361 339 335 381 281 425 192 446 105 467 44 459-30 509L-15 549C60 495 131 514 218 486 303 459 363 416 389 355 418 296 447 256 473 207 513 134 457 109 510 28Z" fill="${url('red')}"/>
        <path d="M480 29C445 103 498 130 459 206 425 270 386 305 373 359" fill="none" stroke="#ed8060" stroke-width="1.3" opacity=".57"/>
        <path d="M490 29C467 97 490 134 464 198 449 240 406 295 386 334L375 382 368 346 396 283 442 203C478 136 444 109 475 35Z" fill="${url('fold')}" opacity=".9"/>
        <path d="M466 109C472 144 470 166 454 196 466 163 450 132 451 104Z" fill="#541010" opacity=".65"/>
        <g clip-path="${url('cloth-mask')}">${textile}</g>
      </g>
      <g class="art-stone">
        <path d="${stonePath}" transform="translate(16 13)" fill="${url('edge')}" fill-rule="evenodd"/>
        <path d="M340 110L354 125 341 131 362 148 347 165 371 179 363 192 386 203 370 222 383 231 373 271 354 296 366 309 351 326 357 344 339 352 347 374 326 387 315 411 331 422 341 397 363 385 354 365 374 357 368 338 383 319 371 306 390 280 394 233 389 212 401 200 378 188 385 175 362 159 372 143 351 123 368 117 348 97Z" fill="#847b64" opacity=".5"/>
        <path d="${stonePath}" fill="${url('stone')}" fill-rule="evenodd"/>
        <g clip-path="${url('stone-mask')}">${pits}</g>
        <path d="M181 139C223 102 280 84 326 93M140 391C160 412 211 434 259 429M110 281C112 239 134 184 174 148" stroke="#fff9e9" stroke-width="2" fill="none" opacity=".8"/>
        <path d="M194 146l-11 29 8 23-16 28M278 99l-12 33 6 20M128 327l29 4 16 23 17 10M273 369l13 12-7 31M336 336l-20-8" fill="none" stroke="#756b54" stroke-width=".9" opacity=".65"/>
        <path d="M194 146l-10 28 8 23M279 101l-11 31M128 329l27 5" fill="none" stroke="#f2ead8" stroke-width=".65"/>
        <path d="M217 147C243 138 280 136 312 150M153 251C141 283 146 317 167 342" fill="none" stroke="#665f4d" stroke-width="3" opacity=".47"/>
        <path d="M215 151C243 142 278 143 308 154" fill="none" stroke="#f4edda" stroke-width="1" opacity=".6"/>
      </g>
      <g class="art-disc-angle" transform="translate(322 270) rotate(-19) scale(1 .86)">
        <circle r="151" cy="9" fill="#32382f"/>
        <circle r="151" fill="${url('metal')}"/>
        <circle r="147" fill="${url('record')}"/>
        <circle r="146" fill="none" stroke="#c6c4b6" stroke-width="1" opacity=".63"/>
        <g class="art-vinyl-spin">
          ${grooves}
          <path d="M-127-73A146 146 0 0 1-22-145L-12-50A52 52 0 0 0-45-28Z" fill="#d9dac7" opacity=".07"/>
          <path d="M127 73A146 146 0 0 1 22 145L12 50A52 52 0 0 0 45 28Z" fill="#e6e0cc" opacity=".11"/>
          <path d="M-18-142A144 144 0 0 1 89-113M-119 77A144 144 0 0 0-71 125" fill="none" stroke="#f6eed6" stroke-width=".7" opacity=".34"/>
          <circle r="48" fill="${url('metal')}"/>
          <circle r="45" fill="#ccd6b2"/>
          <circle r="42" fill="none" stroke="#4b5841" stroke-width=".4" opacity=".6"/>
          <image class="art-brand-logo" href="/hipkop-logo.svg" x="-28" y="-28" width="56" height="56"/>
          <path d="M-32-28A43 43 0 0 1 24-36" fill="none" stroke="#f7f5dc" stroke-width="1.1"/>
        </g>
        <g class="art-pulse" opacity="0">
          <circle r="153" fill="none" stroke="#b8db35" stroke-width="1.1"/>
          <circle r="161" fill="none" stroke="#b8db35" stroke-width=".45" opacity=".45"/>
        </g>
      </g>
      <g class="art-cloth-front">
        <path d="M447 331C412 355 375 397 323 410 294 418 266 399 242 406 202 417 200 449 169 463 132 480 97 464 57 478L-17 514-27 543C29 527 77 487 129 497 172 505 211 487 235 459 255 436 274 441 296 447 342 458 380 426 400 402 422 378 439 355 472 347Z" fill="${url('silk')}"/>
        <path d="M448 332C414 359 376 398 324 411 287 421 273 399 244 407 207 419 204 449 169 465 132 480 91 466 58 479L-17 515" fill="none" stroke="#f49070" stroke-width="1.2" opacity=".72"/>
        <path d="M231 421C246 402 268 406 291 416L302 438C274 424 251 426 226 453L197 478C214 461 215 441 231 421Z" fill="#711713" opacity=".64"/>
        <path d="M319 414C360 420 393 392 412 370 394 410 365 439 330 441L312 431Z" fill="#691612" opacity=".58"/>
        <path d="M333 421C363 425 386 398 401 382M244 418C219 433 220 456 197 473M111 482C144 474 164 486 185 478M21 521C56 505 79 481 108 482" fill="none" stroke="#e76f52" stroke-width="1.6" opacity=".75"/>
        <path d="M237 413C218 427 218 451 197 468M326 422C350 430 373 415 394 395M107 489C139 485 154 496 175 489" fill="none" stroke="#56100f" stroke-width="2.8" opacity=".56"/>
        <path d="M63 487C84 482 102 477 121 478L128 491C103 486 85 490 66 497Z" fill="#e97556" opacity=".48"/>
        <path d="M242 454C266 431 278 450 296 447" fill="none" stroke="#f2a17c" stroke-width="1" opacity=".37"/>
      </g>
      <g class="art-fragment">
        <path d="M460 120l16-28 18 9-3 19-17 12Z" fill="${url('stone')}"/>
        <path d="M474 132l17-12 3-19 7 10-6 17-17 11Z" fill="#837b65"/>
        <path d="M473 98l-5 9 12 8" fill="none" stroke="#fff6df" stroke-width=".7"/>
        <path d="M480 418l19-4 15 23-9 12-27-8Z" fill="${url('stone')}"/>
        <path d="M478 441l27 8 9-12 4 13-11 9-25-6Z" fill="#9a9077"/>
        <path d="M117 411l-17 13-8-6 2-14 13-8Z" fill="${url('stone')}"/>
        <path d="M435 170l7-9 10 5-3 10Z" fill="#b5aa91"/>
        <path d="M445 484l12-7 13 4-5 7Z" fill="#d3c9b3"/>
        <path d="M199 486l7-3 5 5-6 3Z" fill="#8d846d"/>
      </g>
    </svg>`;
    // SVG group transforms force the whole large sculpture to be repainted.
    // Each material now lives in its own HTML compositor layer. The rotating
    // vinyl is a separate small SVG texture, not a mutation of the stone SVG.
    const parsed = new DOMParser().parseFromString(artwork, 'image/svg+xml');
    const definitions = parsed.querySelector('defs').outerHTML;
    const disc = parsed.querySelector('.art-vinyl-spin');
    const pulse = parsed.querySelector('.art-pulse');
    const vinyl = disc.innerHTML;
    const feedback = pulse.innerHTML;
    disc.remove(); pulse.remove();
    let layerSerial = 0;
    const svg = (body, viewBox = '0 0 640 580') => {
      const unique = `${id}-layer-${++layerSerial}`;
      return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${definitions}${body}</svg>`.replaceAll(`${id}-`, `${unique}-`);
    };
    const layers = Array.from(parsed.documentElement.children).filter(child => child.tagName === 'g');
    return `<div class="exhibition-art" aria-hidden="true">
      ${layers.map(group => {
        const name = group.getAttribute('class');
        group.removeAttribute('class');
        const material = `<div class="sculpture-layer ${name}">${svg(group.outerHTML)}</div>`;
        if (name !== 'art-disc-angle') return material;
        return `${material}<div class="vinyl-plane"><div class="art-vinyl-spin">${svg(vinyl, '-151 -151 302 302')}</div></div>
          <div class="pulse-plane"><div class="art-pulse">${svg(feedback, '-166 -166 332 332')}</div></div>`;
      }).join('')}
    </div>`;
  }
  scope.HipkopArt = Object.freeze({ stage });
})(window);
