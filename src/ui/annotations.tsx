import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import type {
  Annotation,
  AnnotationData,
  HighlightColor,
  ReadingPosition,
  TextAnchor,
  ResolvedAnchor,
} from '../core/annotations';
import { serializeAnnotations } from '../core/annotations';
import type { FileSession, FileState } from '../storage/file-session';

export type AnnotationSession = FileSession<AnnotationData>;
function useController(session: AnnotationSession) {
  const [state, setState] = useState<FileState<AnnotationData>>({ ...session.state });
  const [selection, setSelection] = useState<TextAnchor>();
  const [selectionError, setSelectionError] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [selectionRequest, setSelectionRequest] = useState(0);
  const select = (id: string | undefined) => {
    setSelectedId(id);
    if (id) setSelectionRequest((old) => old + 1);
  };
  const [navigation, setNavigation] = useState<{
    position: ReadingPosition;
    token: number;
    annotationId?: string;
  }>({ position: session.state.data.position, token: 0 });
  const [statuses, setStatuses] = useState<Record<string, ResolvedAnchor['status']>>({});
  const token = useRef(0);
  const blocked = useRef(false);
  const [ioBusy, setIoState] = useState(false);
  const setIoBusy = (value: boolean) => {
    blocked.current = value;
    setIoState(value);
  };
  const commit = (update: (data: AnnotationData) => AnnotationData) => {
    const next = update(session.state.data);
    if (serializeAnnotations(next).length > 9_900_000) {
      setSelectionError('Limite complessivo del JSON raggiunto. Riduci o elimina alcune note.');
      return false;
    }
    session.change(() => next);
    return true;
  };
  useEffect(() => session.subscribe(setState), [session]);
  const go = (position: ReadingPosition, annotationId?: string) =>
    setNavigation({ position, token: ++token.current, annotationId });
  const add = (color: HighlightColor, note = false) => {
    if (blocked.current) return;
    if (!selection) return;
    if (session.state.data.annotations.length >= 10_000) {
      setSelectionError('Limite di 10.000 annotazioni raggiunto.');
      return;
    }
    const now = new Date().toISOString(),
      id = crypto.randomUUID();
    if (
      !commit((d) => ({
        ...d,
        annotations: [
          ...d.annotations,
          { id, anchor: selection, color, note: '', createdAt: now, updatedAt: now },
        ],
      }))
    )
      return;
    setSelection(undefined);
    window.getSelection()?.removeAllRanges();
    if (note) select(id);
  };
  const edit = (id: string, change: Partial<Pick<Annotation, 'color' | 'note'>>) => {
    if (blocked.current) return;
    commit((d) => ({
      ...d,
      annotations: d.annotations.map((a) =>
        a.id === id ? { ...a, ...change, updatedAt: new Date().toISOString() } : a,
      ),
    }));
  };
  const remove = (id: string) => {
    if (blocked.current) return;
    session.change((d) => ({ ...d, annotations: d.annotations.filter((a) => a.id !== id) }));
    if (selectedId === id) select(undefined);
  };
  const position = (next: ReadingPosition) => {
    if (blocked.current) return;
    const old = session.state.data.position;
    if (
      old.page === next.page &&
      old.offset === next.offset &&
      old.figure === next.figure &&
      Boolean(old.anchor) === Boolean(next.anchor) &&
      Math.abs((old.fraction ?? 0) - (next.fraction ?? 0)) < 0.015
    )
      return;
    session.change((d) => ({ ...d, position: next }));
  };
  return {
    session,
    state,
    ioBusy,
    setIoBusy,
    data: state.data,
    selection,
    setSelection,
    selectionError,
    setSelectionError,
    selectedId,
    selectionRequest,
    select,
    navigation,
    go,
    add,
    edit,
    remove,
    position,
    statuses,
    report: (next: Record<string, ResolvedAnchor['status']>) =>
      setStatuses((old) => {
        const merged = { ...old, ...next };
        return Object.keys(next).every((id) => old[id] === next[id]) ? old : merged;
      }),
    imported: () => {
      setSelection(undefined);
      setSelectionError('');
      select(undefined);
      setStatuses({});
      go(session.state.data.position);
    },
  };
}
type Controller = ReturnType<typeof useController>;
const Context = createContext<Controller | null>(null);
export function AnnotationProvider({
  session,
  children,
}: {
  session: AnnotationSession;
  children: ComponentChildren;
}) {
  const controller = useController(session);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useAnnotations() {
  const context = useContext(Context);
  if (!context) throw new Error('Annotazioni non inizializzate.');
  return context;
}
