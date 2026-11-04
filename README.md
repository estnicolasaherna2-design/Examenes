# Exam Lab

Aplicación local para practicar certificaciones Microsoft. La interfaz, los bancos de preguntas y los metadatos están separados.

## Requisitos
- Python 3 instalado (solo para levantar un servidor HTTP local).
- Navegador moderno (Edge, Chrome o Firefox).

## Ejecución
1. Descomprime el proyecto.
2. Abre una terminal en la carpeta `ExamLab`.
3. Ejecuta:

   ```bash
   python -m http.server 8000
   ```

4. Abre `http://localhost:8000` en el navegador.

No abras `index.html` directamente con `file://`, porque el navegador puede bloquear la lectura de los JSON mediante `fetch`.

## Agregar un examen
1. Crea una carpeta en `data/exams/` con el identificador, por ejemplo `DP-600`.
2. Crea `questions.json` y `metadata.json` siguiendo los ejemplos existentes.
3. Agrega el examen a `data/catalog.json`, indicando `questionFile` y `metadataFile`.

## Tipos de pregunta soportados
- `multiple`: selección de una opción.
- `boolean`: verdadero o falso.
- `picklist`: selección desde una lista.
- `drag`: emparejar elementos mediante listas desplegables (interacción de asociación; no arrastre HTML5 en esta versión).
- `hotspot`: selección de una zona del diagrama mediante coordenadas porcentuales.

## Ejemplo de pregunta
```json
{
  "id": "DP700-EXAMPLE",
  "domain": "Lakehouse",
  "type": "multiple",
  "question": "Texto de la pregunta",
  "options": ["Opción A", "Opción B", "Opción C"],
  "answer": "Opción B",
  "explanation": "Explicación de la respuesta correcta."
}
```

## Persistencia
Perfil, configuración e historial se guardan en `localStorage` del navegador. No se envían a un servidor. Si se borran los datos del navegador, también se elimina este historial.

## Nota sobre el contenido
Las preguntas incluidas son ejemplos de demostración creados para probar el funcionamiento. No son preguntas oficiales ni garantizan cobertura del temario de certificación.
