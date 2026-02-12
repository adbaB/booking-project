export const isISBN = (str: string): boolean => {
    // Quita guiones o espacios que el usuario pueda escribir
    const clean = str.replace(/[-\s]/g, "");
    // Valida si son 10 o 13 dígitos numéricos (el 10 puede terminar en X)
    return /^(?:\d{9}[\dX]|\d{13})$/.test(clean);
};

export const normalizeSearch = (search: string, stopWords: Set<string>): string[] => {
    return search
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(" ")
        .filter((p) => p.length > 2 && !stopWords.has(p));
};

export const STOP_WORDS = new Set([
    "libro", "de", "la", "el", "en", "y", "a", "los", "las", "un", "una",
    "unos", "unas", "con", "por", "para", "del", "al", "su", "sus", "o",
    "u", "tu", "tus", "mi", "mis", "esta", "este", "esto", "estos",
    "estas", "aquellos", "aquellas", "se", "lo", "que", "como", "mas",
    "pero", "sin", "sobre", "ya", "entre", "cuando", "todo", "the",
    "and", "for", "with", "from", "that", "this", "those", "these",
    "your", "my", "his", "her", "their", "our", "its", "into", "about",
    "than", "then", "them", "they", "will", "shall", "can", "could",
    "should", "would", "must", "may", "might", "been", "were", "was",
    "are", "is", "am", "being", "have", "has", "had", "having", "not",
    "nor", "neither", "either", "both", "each", "every", "any", "all",
    "anywhere"
]);
