import { useState, useEffect } from 'react';
import { getDocumentStatus } from '../services/api';
export const useDocumentStatus = (documentId) => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!documentId)
            return;
        const fetchStatus = async () => {
            try {
                const res = await getDocumentStatus(documentId);
                setStatus(res.data);
            }
            catch (err) {
                setStatus({ status: 'error', error: 'Не удалось загрузить статус' });
            }
            finally {
                setLoading(false);
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 2000);
        return () => clearInterval(interval);
    }, [documentId]);
    return { status, loading };
};
