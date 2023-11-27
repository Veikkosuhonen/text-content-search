import ts from "typescript"

export default class I18nTranslationReference {
    constructor(
        public key: string,
        public file: ts.SourceFile,
        public line: number,
    ) {}

    toString() {
        return `${this.key} ${this.file.fileName.replace(process.cwd(), '')}:${this.line}`
    }

    equals(other: I18nTranslationReference) {
        return this.key === other.key
    }
}
