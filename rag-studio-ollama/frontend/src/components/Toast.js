import { jsx as _jsx } from "react/jsx-runtime";
// components/Toast.tsx
import { Toaster } from 'react-hot-toast';
export default function ToastProvider() {
    return (_jsx(Toaster, { position: "top-right", toastOptions: {
            duration: 4000,
            style: {
                background: '#363636',
                color: '#fff',
            },
            success: {
                duration: 3000,
            },
            error: {
                duration: 5000,
            },
        } }));
}
