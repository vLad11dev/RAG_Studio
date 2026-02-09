import { useState, useEffect } from 'react';
import { getDocumentStatus } from '../services/api';
import { DocumentStatus } from '../types';

export const useDocumentStatus = (documentId: string | null) => {
  const [status, setStatus] = useState<DocumentStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!documentId) return;

    const fetchStatus = async () => {
      try {
        const res = await getDocumentStatus(documentId);
        setStatus(res.data as any);
      } catch (err) {
        setStatus({ status: 'error', error: 'Не удалось загрузить статус' } as any);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [documentId]);

  return { status, loading };
};
