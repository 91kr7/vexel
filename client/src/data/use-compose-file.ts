import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchComposeFiles,
  validateComposeFile,
  writeComposeFile,
  type ComposeFileContent,
  type ComposeValidationResult,
} from './compose-client';

export interface UseComposeFileResult {
  /** One entry per discovered compose file of the project (several when it was brought up with several `-f` files). */
  files: ComposeFileContent[];
  loaded: boolean;
  error?: string;
  /** Paths currently edited but not saved back to disk. */
  dirtyPaths: string[];
  saving: boolean;
  validation?: ComposeValidationResult;
  validating: boolean;
  edit: (path: string, content: string) => void;
  save: (path: string) => Promise<boolean>;
  validate: () => Promise<void>;
}

/**
 * Reads a project's compose file(s), tracks unsaved edits per path, saves one
 * back to disk after the caller has confirmed, and validates on demand
 * (REQ-77, REQ-116).
 */
export function useComposeFile(projectName: string | undefined): UseComposeFileResult {
  const [files, setFiles] = useState<ComposeFileContent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<ComposeValidationResult | undefined>(undefined);
  const [validating, setValidating] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setLoaded(false);
    setError(undefined);
    setFiles([]);
    setEdits({});
    setValidation(undefined);
    if (!projectName) return;

    fetchComposeFiles(projectName)
      .then((result) => {
        if (cancelledRef.current) return;
        if (result.ok) setFiles(result.files);
        else setError(result.reason);
      })
      .catch((cause: Error) => {
        if (cancelledRef.current) return;
        setError(cause.message);
      })
      .finally(() => {
        if (cancelledRef.current) return;
        setLoaded(true);
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [projectName]);

  const edit = useCallback((path: string, content: string) => {
    setEdits((current) => ({ ...current, [path]: content }));
  }, []);

  const save = useCallback(
    async (path: string): Promise<boolean> => {
      if (!projectName) return false;
      const content = edits[path];
      if (content === undefined) return true;
      setSaving(true);
      try {
        const result = await writeComposeFile(projectName, path, content);
        if (!result.ok) {
          setError(result.reason);
          return false;
        }
        setFiles((current) => current.map((file) => (file.path === path ? { ...file, content } : file)));
        setEdits((current) => {
          const next = { ...current };
          delete next[path];
          return next;
        });
        setError(undefined);
        return true;
      } catch (cause) {
        setError((cause as Error).message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [projectName, edits],
  );

  const validate = useCallback(async () => {
    if (!projectName) return;
    setValidating(true);
    try {
      setValidation(await validateComposeFile(projectName));
    } catch (cause) {
      setValidation({ valid: false, errors: [(cause as Error).message], services: [], volumes: [], networks: [] });
    } finally {
      setValidating(false);
    }
  }, [projectName]);

  const effectiveFiles = files.map((file) => ({ path: file.path, content: edits[file.path] ?? file.content }));

  return {
    files: effectiveFiles,
    loaded,
    error,
    dirtyPaths: Object.keys(edits),
    saving,
    validation,
    validating,
    edit,
    save,
    validate,
  };
}
