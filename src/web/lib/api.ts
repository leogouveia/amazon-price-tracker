
const API_TOKEN = import.meta.env.VITE_API_TOKEN;

export async function apiFetch(path: string, options: RequestInit = {}) {
    return fetch(path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "x-api-token": API_TOKEN,
            ...options.headers,
        },
    });
}