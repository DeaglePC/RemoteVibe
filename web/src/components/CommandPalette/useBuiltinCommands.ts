import { useMemo } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useBackendStore } from '../../stores/backendStore';
import type { CommandDef } from './types';

interface ExtraActions {
  /** 新建会话：点击后走 App 层 launchTrigger 弹出 workspace picker */
  onNewSession: () => void;
  /** 停止当前 Agent */
  onStopAgent: () => void;
}

/**
 * 构建命令面板的内置命令集合（MVP，Q-P3.3=A）。
 *
 * 包含：
 *  - 切换 Sidebar 折叠（Cmd+B）
 *  - 切换 Right Pane（Cmd+J）
 *  - 切换 Sidebar 到会话/设置模式
 *  - 新建会话（Cmd+N，透传到 App 层的 launchTrigger）
 *  - 停止当前 Agent（如有）
 *  - 打开后端机器设置
 *  - 激活当前可用会话列表（动态生成）
 *  - 切换主题快捷指令（预留给 P5）
 */
export function useBuiltinCommands(extra: ExtraActions): CommandDef[] {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const activeAgentId = useChatStore((s) => s.activeAgentId);

  const { onNewSession, onStopAgent } = extra;

  return useMemo<CommandDef[]>(() => {
    const cmds: CommandDef[] = [];

    // —— 导航类 ——
    cmds.push({
      id: 'ui.toggleSidebar',
      title: '折叠 / 展开 Sidebar',
      subtitle: '侧栏开关',
      icon: '◧',
      keywords: 'sidebar toggle collapse',
      shortcut: '⌘B',
      run: () => useUIStore.getState().toggleSidebarCollapsed(),
    });
    cmds.push({
      id: 'ui.toggleRightPane',
      title: '打开 / 关闭 文件面板',
      subtitle: '右侧 Pane',
      icon: '📂',
      keywords: 'right pane files',
      shortcut: '⌘J',
      run: () => {
        useUIStore.getState().setRightPaneContent('files');
        useUIStore.getState().toggleRightPaneOpen();
      },
    });
    cmds.push({
      id: 'ui.sidebarSessions',
      title: '切到会话模式',
      subtitle: 'Sidebar 显示项目手风琴',
      icon: '💬',
      keywords: 'sidebar sessions projects',
      run: () => {
        const st = useUIStore.getState();
        st.setSidebarMode('sessions');
        if (st.sidebarCollapsed) st.setSidebarCollapsed(false);
      },
    });
    cmds.push({
      id: 'ui.sidebarSettings',
      title: '切到设置模式',
      subtitle: 'Sidebar 显示设置导航',
      icon: '⚙️',
      keywords: 'sidebar settings preferences',
      shortcut: '⌘,',
      run: () => {
        const st = useUIStore.getState();
        st.setSidebarMode('settings');
        if (st.sidebarCollapsed) st.setSidebarCollapsed(false);
      },
    });

    // —— 会话类 ——
    cmds.push({
      id: 'session.new',
      title: '新建会话',
      subtitle: '选择工作目录启动 Agent',
      icon: '＋',
      keywords: 'new session create launch',
      shortcut: '⌘N',
      run: onNewSession,
    });

    if (agentStatus === 'running' && activeAgentId) {
      cmds.push({
        id: 'agent.stop',
        title: '停止当前 Agent',
        icon: '■',
        keywords: 'stop kill agent',
        run: onStopAgent,
      });
    }

    // 会话切换命令：动态生成 top N
    const TOP = 10;
    for (const s of sessions.slice(0, TOP)) {
      if (s.id === activeSessionId) continue;
      cmds.push({
        id: `session.switch.${s.id}`,
        title: `切换会话：${s.name}`,
        subtitle: s.workDir,
        icon: '›',
        keywords: `switch session ${s.name} ${s.workDir}`,
        run: () => useChatStore.getState().switchSession(s.id),
      });
    }

    // —— 后端类 ——
    cmds.push({
      id: 'backend.open',
      title: '管理后端机器',
      subtitle: '多机器 CRUD / 切换激活',
      icon: '🖥️',
      keywords: 'backend machine server host',
      run: () => useBackendStore.getState().setShowSettings(true),
    });

    return cmds;
  }, [sessions, activeSessionId, agentStatus, activeAgentId, onNewSession, onStopAgent]);
}
