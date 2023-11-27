import ts from "typescript"

export default class I18nTranslation {

    constructor(
        public lang: string,
        public key: string,
        public value: string,
        public file: ts.SourceFile,
        public line: number,
    ) {}

    toString() {
        return `${this.lang} ${this.key}`
    }

    equals(other: I18nTranslation) {
        return this.key === other.key && this.lang === other.lang
    }
}
