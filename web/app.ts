import "./styles/main.css";
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import { authState, getStoredSession, refreshAuth, sanitizeRedirect } from "./auth-client.ts";
import CallbackView from "./components/CallbackView.vue";
import HomeView from "./components/HomeView.vue";
import LoginView from "./components/LoginView.vue";
import InviteView from "./components/InviteView.vue";
import TableView from "./components/TableView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginView },
    { path: "/auth/petrock/callback", component: CallbackView },
    // the table page opens from a share link and works without signing in
    { path: "/invite/:token", component: InviteView },
    { path: "/t/:token", redirect: (to) => ({ path: `/invite/${to.params.token}`, query: to.query }) },
    { path: "/tables/:id", component: TableView, meta: { requiresAuth: true } },
    { path: "/", component: HomeView, meta: { requiresAuth: true } },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

router.beforeEach(async (to) => {
  if (to.path === "/auth/petrock/callback") {
    return true;
  }

  const needsCheck = !authState.checked || Boolean(to.meta.requiresAuth) || Boolean(getStoredSession());
  const user = needsCheck ? await refreshAuth() : authState.user;

  if (to.meta.requiresAuth && !user) {
    return {
      path: "/login",
      query: { redirect: to.fullPath },
    };
  }

  if (to.path === "/login" && user) {
    return sanitizeRedirect(to.query.redirect);
  }

  return true;
});

createApp(App).use(router).mount("#app");
