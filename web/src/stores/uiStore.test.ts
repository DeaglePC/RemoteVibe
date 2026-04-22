import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './uiStore';

/** 在每个测试前重置 mobile 导航状态，避免用例之间污染 */
beforeEach(() => {
  useUIStore.setState({ mobileTab: 'sessions', mobileNavStack: [] });
});

describe('uiStore.mobile navigation', () => {
  it('pushMobilePage appends to stack', () => {
    const st = useUIStore.getState();
    st.pushMobilePage({ type: 'chat', sessionId: 's1' });
    st.pushMobilePage({ type: 'files', rootPath: '/tmp' });

    const stack = useUIStore.getState().mobileNavStack;
    expect(stack).toHaveLength(2);
    expect(stack[0]).toEqual({ type: 'chat', sessionId: 's1' });
    expect(stack[1]).toEqual({ type: 'files', rootPath: '/tmp' });
  });

  it('popMobilePage removes top frame', () => {
    const st = useUIStore.getState();
    st.pushMobilePage({ type: 'chat', sessionId: 's1' });
    st.pushMobilePage({ type: 'files', rootPath: '/tmp' });
    st.popMobilePage();

    const stack = useUIStore.getState().mobileNavStack;
    expect(stack).toHaveLength(1);
    expect(stack[0]).toEqual({ type: 'chat', sessionId: 's1' });
  });

  it('popMobilePage on empty stack is a no-op', () => {
    useUIStore.getState().popMobilePage();
    expect(useUIStore.getState().mobileNavStack).toEqual([]);
  });

  it('clearMobileStack empties the stack', () => {
    const st = useUIStore.getState();
    st.pushMobilePage({ type: 'chat', sessionId: 's1' });
    st.pushMobilePage({ type: 'files', rootPath: '/tmp' });
    st.clearMobileStack();
    expect(useUIStore.getState().mobileNavStack).toEqual([]);
  });

  it('setMobileTab resets the nav stack', () => {
    const st = useUIStore.getState();
    st.pushMobilePage({ type: 'chat', sessionId: 's1' });
    st.setMobileTab('settings');

    const state = useUIStore.getState();
    expect(state.mobileTab).toBe('settings');
    expect(state.mobileNavStack).toEqual([]);
  });
});
