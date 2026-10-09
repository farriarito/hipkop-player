'use strict';
// Session secrets stay in HttpOnly cookies. CSRF lives only in memory.
window.HipkopAccount = (() => {
  let session = null;
  async function refresh() {
    const response = await fetch('/api/auth/me');
    if (!response.ok) throw new Error('账号服务暂不可用');
    session = await response.json(); return session;
  }
  function form(register = false) {
    openSheet(`<h3>${register ? '加入 HIPKOP' : '登录 HIPKOP'}</h3>
      <p>用自己的身份发声。公开帖子审核后展示；收藏目前保存在本机。</p>
      <form id="accountForm">
      <label class="field"><span>账号</span><input name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_\\-]{3,32}" placeholder="3–32 位字母、数字、下划线"></label>
      ${register ? '<label class="field"><span>昵称</span><input name="displayName" maxlength="40" autocomplete="nickname" placeholder="社区显示的名字"></label>' : ''}
      <label class="field"><span>密码</span><input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="10" maxlength="128" placeholder="至少 10 位"></label>
      <p id="accountError" role="alert"></p>
      <button class="cta" type="submit">${register ? '注册并登录' : '登录'}</button>
      <button class="ghost" type="button" onclick="HipkopAccount.form(${!register})">${register ? '已有账号，去登录' : '没有账号，去注册'}</button>
      </form>`);
    document.getElementById('accountForm').addEventListener('submit', async event => {
      event.preventDefault();
      const formElement = /** @type {HTMLFormElement} */ (event.currentTarget);
      const button = /** @type {HTMLButtonElement} */ (formElement.querySelector('[type=submit]'));
      button.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(formElement));
        const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok) throw new Error(({ username_taken: '账号已被使用', invalid_credentials: '账号或密码不正确', rate_limited: '操作太频繁，请稍后再试', invalid_credentials_format: '请检查账号格式，密码至少 10 位' })[data.error] || '暂时无法登录，请稍后再试');
        session = data; closeSheet(); toast('已登录，可以写一帖了'); openPostComposer();
      } catch (error) { document.getElementById('accountError').textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
  async function ensure() {
    const info = await refresh();
    if (info.requireAccount && !info.user) { form(); return false; }
    return true;
  }
  async function logout() {
    await refresh();
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session?.csrf || '' } });
    if (response.ok) { session = null; closeSheet(); toast('已退出登录'); }
    else toast('退出失败，请稍后再试');
  }
  return { refresh, form, ensure, logout, headers: () => session?.csrf ? { 'X-CSRF-Token': session.csrf } : {}, user: () => session?.user };
})();
