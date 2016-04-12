# mlcl_mailer
Mailer plugin for molecuel

## Development Installation:
git clone https://github.com/molecuel/mlcl_mailer.git

npm install
typings install

## API
You can register own functions to process a mail response queue.
The registerHandler expects function(object) syntax. The function parameter
*object* will become a stringified response object.
