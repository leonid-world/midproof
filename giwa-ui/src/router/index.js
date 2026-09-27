import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import { useAuthStore } from '../stores/auth'
import {
  isMidnightPocEnabled,
  isMidnightProofBridgeEnabled,
  isMidnightDemoEnabled,
} from '../services/midnight/config'

const SITE_TITLE = 'MidProof'

const midnightProofRoutes = isMidnightProofBridgeEnabled
  ? [
      {
        path: '/midnight/prove',
        name: 'midnight-prove',
        component: () => import('../views/MidnightAssignedRequestsView.vue'),
        meta: {
          requiresAuth: true,
          midnightPoc: true,
          midnightProofBridge: true,
          noindex: true,
          title: '받은 검증 요청',
        },
      },
      ...(import.meta.env.DEV && !isMidnightDemoEnabled
        ? [
            {
              path: '/midnight/legacy/prove',
              name: 'midnight-legacy-prove',
              component: () => import('../views/MidnightProveView.vue'),
              meta: {
                requiresAuth: true,
                midnightPoc: true,
                midnightProofBridge: true,
                noindex: true,
                title: '이전 증명 진단',
              },
            },
          ]
        : []),
    ]
  : []

const midnightRoutes = isMidnightPocEnabled
  ? [
      {
        path: '/midnight',
        name: 'midnight',
        component: () => import('../views/MidnightProofRequestsView.vue'),
        meta: {
          requiresAuth: true,
          midnightPoc: true,
          noindex: true,
          title: '재무 검증 요청',
        },
      },
      ...(import.meta.env.DEV && !isMidnightDemoEnabled
        ? [
            {
              path: '/midnight/legacy/results',
              name: 'midnight-legacy-results',
              component: () => import('../views/MidnightEligibilityView.vue'),
              meta: {
                requiresAuth: true,
                midnightPoc: true,
                noindex: true,
                title: '이전 결과 진단',
              },
            },
            {
              path: '/midnight/legacy/authorize',
              name: 'midnight-legacy-authorize',
              component: () => import('../views/MidnightAuthorizationView.vue'),
              meta: {
                requiresAuth: true,
                midnightPoc: true,
                noindex: true,
                title: '이전 지갑 동의 진단',
              },
            },
          ]
        : []),
      ...midnightProofRoutes,
    ]
  : []

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true, title: '로그인' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
      meta: { requiresAuth: true, noindex: true, title: '대시보드' },
    },
    {
      path: '/receivables',
      name: 'receivables',
      component: () => import('../views/ReceivablesView.vue'),
      meta: { requiresAuth: true, noindex: true, title: '매출채권' },
    },
    {
      path: '/funding',
      name: 'funding',
      component: () => import('../views/FundingView.vue'),
      meta: { requiresAuth: true, noindex: true, title: '채권 펀딩' },
    },
    {
      path: '/repayment',
      name: 'repayment',
      component: () => import('../views/RepaymentView.vue'),
      meta: { requiresAuth: true, noindex: true, title: '채권 상환' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../views/ProfileView.vue'),
      meta: { requiresAuth: true, noindex: true, title: '내 정보' },
    },
    ...(isMidnightDemoEnabled
      ? [
          {
            path: '/demo',
            name: 'demo',
            component: () => import('../views/WalletlessDemoView.vue'),
            meta: { requiresAuth: true, demoOnly: true, noindex: true, title: 'ZK 증명 체험' },
          },
        ]
      : []),
    ...midnightRoutes,
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/NotFoundView.vue'),
      meta: { noindex: true, title: '페이지를 찾을 수 없음' },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.midnightProofBridge && !isMidnightProofBridgeEnabled) {
    return { name: 'not-found' }
  }
  if (to.meta.midnightPoc && !isMidnightPocEnabled) return { name: 'not-found' }
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: 'login' }
  if (auth.isDemoSession && to.meta.requiresAuth && !to.meta.demoOnly) return { name: 'demo' }
  if (to.meta.demoOnly && auth.isAuthenticated && !auth.isDemoSession) return { name: 'dashboard' }
  if (to.meta.guestOnly && auth.isAuthenticated)
    return { name: auth.isDemoSession ? 'demo' : 'dashboard' }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | ${SITE_TITLE}` : SITE_TITLE
  document
    .querySelector('meta[name="robots"]')
    ?.setAttribute('content', to.meta.noindex ? 'noindex, nofollow' : 'index, follow')
})

export default router
