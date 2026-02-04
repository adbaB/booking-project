package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

type RawBook struct {
	Url  string `json:"url"`
	Name string `json:"name"`
	Isbn string `json:"isbn"`
}

type Book struct {
	N string `json:"n"`
	U string `json:"u"`
}

type Index struct {
	Book Book
	Isbn string
}

func main() {
	// 1. Pre-procesar Stop Words en un mapa para búsqueda instantánea
	stopMap := make(map[string]struct{})
	for _, w := range getStopWords() {
		stopMap[w] = struct{}{}
	}

	dirPath := filepath.Join(`E:\`, "books")
	targetDirIsbn := filepath.Join(`E:\`, "index", "v2", "isbn")
	targetDirLetters := filepath.Join(`E:\`, "index", "v2", "letter")

	os.MkdirAll(targetDirIsbn, 0755)
	os.MkdirAll(targetDirLetters, 0755)

	bookChan := make(chan Index, 5000)
	var wg sync.WaitGroup

	// --- ESTRUCTURAS DE DATOS GLOBALES ---
	// Usamos Mutex porque ahora múltiples hilos escribirán en estos mapas
	isbnData := make(map[string]map[string]Book)
	letterData := make(map[string]map[string]map[string]struct{}) // [prefijo][palabra][isbn]
	var dataMu sync.Mutex

	// --- CONSUMIDOR (Procesa los libros que llegan de los archivos) ---
	wg.Add(1)
	go func() {
		defer wg.Done()
		for b := range bookChan {
			dataMu.Lock()

			// Procesar ISBN
			suffixIsbn := getSuffix(b.Isbn, 3, false)
			if _, ok := isbnData[suffixIsbn]; !ok {
				isbnData[suffixIsbn] = make(map[string]Book)
			}
			isbnData[suffixIsbn][b.Isbn] = b.Book

			// Procesar Letras/Palabras
			words := strings.Fields(strings.ReplaceAll(b.Book.N, "-", " "))

			for _, word := range words {

				word = strings.ToLower(word)
				word = normalizeWord(word)
				if len(word) <= 2 {
					continue
				}
				if _, isStop := stopMap[word]; isStop {
					continue
				}

				suffixLetter := getSuffix(word, 3, true)
				if _, ok := letterData[suffixLetter]; !ok {
					letterData[suffixLetter] = make(map[string]map[string]struct{})
				}
				if _, ok := letterData[suffixLetter][word]; !ok {
					letterData[suffixLetter][word] = make(map[string]struct{})
				}
				// El mapa evita duplicados automáticamente sin buscar en slices
				letterData[suffixLetter][word][b.Isbn] = struct{}{}
			}
			dataMu.Unlock()
		}
	}()

	// --- PRODUCTORES PARALELOS (Lectura de archivos) ---
	files, _ := os.ReadDir(dirPath)
	var readerWg sync.WaitGroup
	semaphore := make(chan struct{}, 8) // Máximo 8 archivos abiertos a la vez

	for _, f := range files {
		if !strings.HasSuffix(f.Name(), ".json") {
			continue
		}

		readerWg.Add(1)
		go func(name string) {
			defer readerWg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()
			fmt.Println("Procesando Archivo: ", name)
			processFile(filepath.Join(dirPath, name), bookChan)
		}(f.Name())
	}

	readerWg.Wait()
	close(bookChan)
	wg.Wait()

	// --- GUARDADO FINAL ---
	fmt.Println("Guardando archivos...")
	saveAll(targetDirIsbn, targetDirLetters, isbnData, letterData)
	fmt.Println("¡Proceso completado!")
}

func processFile(path string, out chan<- Index) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	var rawBooks []RawBook
	if err := json.NewDecoder(file).Decode(&rawBooks); err != nil {
		return
	}

	for _, rb := range rawBooks {
		if rb.Isbn == "" {
			continue
		}

		out <- Index{
			Isbn: rb.Isbn,
			Book: Book{
				N: strings.TrimPrefix(rb.Name, "libro-"),
				U: rb.Url,
			},
		}
	}
}

func getSuffix(s string, n int, start bool) string {
	if len(s) < n {
		return s
	}
	if start {
		return s[0:n]
	}
	return s[len(s)-n:]
}

func saveAll(tIsbn, tLetter string, isbnMap map[string]map[string]Book, letterMap map[string]map[string]map[string]struct{}) {
	var wg sync.WaitGroup
	// Limitamos a 20 escrituras simultáneas para no saturar el disco/OS
	sem := make(chan struct{}, 20)

	// Guardar ISBNs
	for suffix, data := range isbnMap {
		wg.Add(1)
		sem <- struct{}{} // Bloquea si ya hay 20 activos
		go func(s string, d map[string]Book) {
			defer wg.Done()
			defer func() { <-sem }() // Libera el espacio al terminar
			saveJson(filepath.Join(tIsbn, s+".json"), d)
		}(suffix, data)
	}

	// Guardar Letras
	for suffix, words := range letterMap {
		wg.Add(1)
		sem <- struct{}{}
		go func(s string, w map[string]map[string]struct{}) {
			defer wg.Done()
			defer func() { <-sem }()

			finalData := make(map[string][]string)
			for word, isbns := range w {
				for isbn := range isbns {
					finalData[word] = append(finalData[word], isbn)
				}
			}
			saveJson(filepath.Join(tLetter, s+".json"), finalData)
		}(suffix, words)
	}
	wg.Wait()
}

func saveJson(path string, data interface{}) {
	f, _ := os.Create(path)
	defer f.Close()
	bytes, _ := json.Marshal(data)
	f.Write(bytes)
}

func getStopWords() []string {
	return []string{"libro", "de", "la", "el", "en", "y", "a", "los", "las", "un", "una", "unos", "unas",
		"con", "por", "para", "del", "al", "su", "sus", "o", "u", "tu", "tus", "mi", "mis",
		"esta", "este", "esto", "estos", "estas", "aquellos", "aquellas", "se", "lo", "que",
		"como", "mas", "pero", "sus", "sin", "sobre", "este", "ya", "entre", "cuando", "todo",

		// --- INGLÉS ---
		"the", "and", "for", "with", "from", "that", "this", "those", "these", "your", "my",
		"his", "her", "their", "our", "its", "into", "about", "than", "then", "them", "they",
		"will", "shall", "can", "could", "should", "would", "must", "may", "might", "shall",
		"been", "were", "was", "are", "is", "am", "being", "have", "has", "had", "having",
		"not", "nor", "neither", "either", "both", "each", "every", "any", "all", "anywhere", "in", "to", "of", "volume", "volumen", "at"}
}

func normalizeWord(s string) string {
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	result, _, _ := transform.String(t, strings.ToLower(s))
	return result
}
