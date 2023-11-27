import { Project, parseFromProject } from '@ts-ast-parser/core';
import ts from 'typescript';
import kleur from 'kleur'

const localesDir = 'shared/locales/'

const NAMESPACE_SPLITTER = '.'

const traverse = (node: ts.Node, kind: ts.SyntaxKind, onEach: (node: ts.Node) => void) => {
    if (node.kind === kind) {
        onEach(node)
    }
    node.forEachChild(child => traverse(child, kind, onEach))
}

const findFirst = (node: ts.Node, kind: ts.SyntaxKind): ts.Node | undefined => {
    if (node.kind === kind) {
        return node
    }
    let result: ts.Node | undefined
    node.forEachChild(child => {
        if (!result) {
            result = findFirst(child, kind)
        }
    })
    return result
}

const findTranslations = (project: Project): Set<Translation> => {
    const translations = new Set<Translation>()

    project.getModules().forEach((module) => {
        if (module.getTSNode().fileName.includes(localesDir)) {
            const lang = module.getTSNode().fileName.split(localesDir)[1]!.split('.')[0]!
            const objNode = findFirst(module.getTSNode(), ts.SyntaxKind.ObjectLiteralExpression)
            if (!objNode) {
                return
            }
            traverseObject(objNode, '', (path, node) => {
                if (node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
                    translations.add(new Translation(
                        lang,
                        path,
                        node.getText().slice(1, -1),
                        node.getSourceFile(),
                        node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line,
                    ))
                }
            })
        }
    })

    return translations
}

const findReferences = (project: Project): Set<TranslationReference> => {
    const callNodes: ts.Node[] = []

    project.getModules().forEach((module) => {
        traverse(module.getTSNode(), ts.SyntaxKind.CallExpression, (node) => {
            if (node.getFirstToken()?.getText() === 't') {
                callNodes.push(node)
            }
        })
    })

    const translationKeys = new Set<TranslationReference>()

    callNodes.forEach((node) => {
        node.forEachChild((child) => {
            if (child.kind === ts.SyntaxKind.StringLiteral || child.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral /*|| child.kind === ts.SyntaxKind.TemplateExpression*/) {
                const file = child.getSourceFile()
                const childPos = child.getStart()
                const line = file.getLineAndCharacterOfPosition(childPos).line
                let key = child.getText().slice(1, -1)
                if (!key.includes(NAMESPACE_SPLITTER)) {
                    key = `common${NAMESPACE_SPLITTER}${key}`
                }

                translationKeys.add(new TranslationReference(
                    key,
                    file,
                    line,
                ))
            }
        })
    })

    return translationKeys
}

const traverseObject = (node: ts.Node, keyPath: string, onEach: (path: string, node: ts.Node) => void) => {
    node.forEachChild((child) => {
        if (child.kind === ts.SyntaxKind.PropertyAssignment) {
            const nameNode = child.getChildAt(0)
            let name = nameNode.getText()
            const value = child.getChildAt(2)

            if (nameNode.kind === ts.SyntaxKind.StringLiteral || nameNode.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
                name = name.slice(1, -1)
            }

            const newKeyPath = keyPath ? `${keyPath}${NAMESPACE_SPLITTER}${name}` : name
            if (value.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                traverseObject(value, newKeyPath, onEach)
            } else {
                onEach(newKeyPath, value)
            }
        }
    })
}

export const analyse = async () => {
    console.log('Parsing...')

    const result = await parseFromProject({
        skipDiagnostics: true,
        jsProject: false,
    })

    if (result.errors.length === 0) {
        console.log('Success parsing!');
    } else {
        result.errors.forEach((error) => {
            console.log(error.messageText);
        })
    }
    
    const project = result.project
    if (!project) {
        console.log("Project not found!")
        return;
    }

    const translations = findTranslations(project)
    translations.forEach((translation) => {
        console.log(translation.toString())
    })

    const references = findReferences(project)
    references.forEach((reference) => {
        console.log(reference.toString())
    })

    const missingTranslations = Array.from(references).filter((reference) => {
        const translation = Array.from(translations).find((translation) => translation.key === reference.key)
        return !translation
    })

    const unusedTranslations = Array.from(translations).filter((translation) => {
        const reference = Array.from(references).find((reference) => reference.key === translation.key)
        return !reference
    })

    console.log(kleur.bold().underline().green('Missing translations:'))
    missingTranslations.forEach((translation) => {
        console.log(kleur.red(translation.toString()))
    })

    console.log(kleur.bold().underline().green('Unused translations:'))
    unusedTranslations.forEach((translation) => {
        console.log(kleur.red(translation.toString()))
    })
}

class TranslationReference {
    constructor(
        public key: string,
        public file: ts.SourceFile,
        public line: number,
    ) {}

    toString() {
        return `${this.key} ${this.file.fileName.replace(process.cwd(), '')}:${this.line}`
    }

    equals(other: TranslationReference) {
        return this.key === other.key
    }
}

class Translation {

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

    equals(other: Translation) {
        return this.key === other.key && this.lang === other.lang
    }
}