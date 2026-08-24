FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app

# Exécution en utilisateur NON-ROOT (durcissement, Semgrep dockerfile.missing-user) : si le process
# est compromis, pas de privilèges root dans le conteneur. `useradd` existe sur l'image Debian slim ;
# on donne la propriété de /app au user. Le port 8000 (> 1024) est bindable sans privilège.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
