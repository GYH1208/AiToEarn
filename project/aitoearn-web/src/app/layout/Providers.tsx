/**
 * Providers - 全局 Provider 组件
 * 包含 Google OAuth、Ant Design 配置、Toast、主题等全局配置
 */

'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from 'next-themes'
import { useEffect, useLayoutEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import LoginDialog from '@/app/layout/LoginDialog'
import { InviteCodeHandler } from '@/components/InviteCodeHandler'
import SettingsModal from '@/components/SettingsModal'
import { useSettingsModalStore } from '@/components/SettingsModal/store'
import NotificationCenter from '@/components/ui/NotificationCenter'
import { Toaster } from '@/components/ui/sonner'
import { useUserStore } from '@/store/user'

export function Providers({ children, lng }: { children: React.ReactNode, lng: string }) {
  const { _hasHydrated, _appInitialized } = useUserStore(
    useShallow(state => ({
      _hasHydrated: state._hasHydrated,
      _appInitialized: state._appInitialized,
    })),
  )

  // 全局设置弹框状态
  const { settingsVisible, settingsDefaultTab, closeSettings } = useSettingsModalStore()

  useEffect(() => {
    if (_hasHydrated) {
      useUserStore.getState().appInit()
    }
  }, [_hasHydrated])

  useEffect(() => {
    useUserStore.getState().setLang(lng)
  }, [lng])

  // 拦截 @react-oauth/google 的脚本加载，添加 ?hl= 参数以设置按钮语言
  useLayoutEffect(() => {
    const hl = lng.replace('-', '_')
    const GIS_URL = 'https://accounts.google.com/gsi/client'
    const originalAppendChild = document.body.appendChild.bind(document.body)

    document.body.appendChild = function <T extends Node>(node: T): T {
      if (node instanceof HTMLScriptElement && node.src === GIS_URL) {
        node.src = `${GIS_URL}?hl=${hl}`
      }
      return originalAppendChild(node)
    }

    return () => {
      document.body.appendChild = originalAppendChild
    }
  }, [lng])

  return (
    <>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <GoogleOAuthProvider clientId="1094109734611-flskoscgp609mecqk9ablvc6i3205vqk.apps.googleusercontent.com">
          {/* 邀请码处理 - 检测 URL 中的 ref 参数并绑定邀请关系 */}
          <InviteCodeHandler />
          <Toaster position="top-center" richColors />
          {/* 专用右上角通知中心（不影响现有 toast） */}
          <NotificationCenter />
          {/* 全局登录弹框 */}
          <LoginDialog />
          {/* 全局设置弹框 - 统一在此渲染，避免多处重复 */}
          <SettingsModal
            open={settingsVisible}
            onClose={closeSettings}
            defaultTab={settingsDefaultTab}
          />
          {/* 等待 appInit（含自动登录）完成后再渲染页面，避免子组件在 token 就位前发出无认证请求 */}
          {_hasHydrated && _appInitialized ? children : (
            <div className="flex h-screen items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
            </div>
          )}
        </GoogleOAuthProvider>
      </ThemeProvider>
    </>
  )
}
