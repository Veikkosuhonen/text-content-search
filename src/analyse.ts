import { Project, parseFromProject } from '@ts-ast-parser/core';
import ts from 'typescript';
import kleur from 'kleur'
import I18nTranslation from './I18nTranslation.js';
import I18nTranslationReference from './I18nTranslationReference.js';

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

const findTranslations = (project: Project, localesDir: string, namespaceSplitter: string): Set<I18nTranslation> => {
    const translations = new Set<I18nTranslation>()

    project.getModules().forEach((module) => {
        if (module.getTSNode().fileName.includes(localesDir)) {
            const lang = module.getTSNode().fileName.split(localesDir)[1]!.split('.')[0]!
            const objNode = findFirst(module.getTSNode(), ts.SyntaxKind.ObjectLiteralExpression)
            if (!objNode) {
                return
            }
            traverseTranslationObject(objNode, '', namespaceSplitter, (path, node) => {
                if (node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
                    translations.add(new I18nTranslation(
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

const findReferences = (project: Project, namespaceSplitter: string): Set<I18nTranslationReference> => {
    const callNodes: ts.Node[] = []

    project.getModules().forEach((module) => {
        traverse(module.getTSNode(), ts.SyntaxKind.CallExpression, (node) => {
            if (node.getFirstToken()?.getText() === 't') {
                callNodes.push(node)
            }
        })
    })

    const translationKeys = new Set<I18nTranslationReference>()

    callNodes.forEach((node) => {
        node.forEachChild((child) => {
            if (child.kind === ts.SyntaxKind.StringLiteral || child.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral /*|| child.kind === ts.SyntaxKind.TemplateExpression*/) {
                const file = child.getSourceFile()
                const childPos = child.getStart()
                const line = file.getLineAndCharacterOfPosition(childPos).line
                let key = child.getText().slice(1, -1)
                if (!key.includes(namespaceSplitter)) {
                    key = `common${namespaceSplitter}${key}`
                }

                translationKeys.add(new I18nTranslationReference(
                    key,
                    file,
                    line,
                ))
            }
        })
    })

    return translationKeys
}

const traverseTranslationObject = (node: ts.Node, keyPath: string, namespaceSplitter: string, onEach: (path: string, node: ts.Node) => void) => {
    node.forEachChild((child) => {
        if (child.kind === ts.SyntaxKind.PropertyAssignment) {
            const nameNode = child.getChildAt(0)
            let name = nameNode.getText()
            const value = child.getChildAt(2)

            if (nameNode.kind === ts.SyntaxKind.StringLiteral || nameNode.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
                name = name.slice(1, -1)
            }

            const newKeyPath = keyPath ? `${keyPath}${namespaceSplitter}${name}` : name
            if (value.kind === ts.SyntaxKind.ObjectLiteralExpression) {
                traverseTranslationObject(value, newKeyPath, namespaceSplitter, onEach)
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

    const localesDir = 'shared/locales/'
    const namespaceSplitter = '.'

    const translations = findTranslations(project, localesDir, namespaceSplitter)
    translations.forEach((t) => {
        console.log(t.toString())
    })

    const references = findReferences(project, namespaceSplitter)
    references.forEach((reference) => {
        console.log(reference.toString())
    })

    const missingTranslations = Array.from(references).filter((reference) => {
        const I18nTranslation = Array.from(translations).find((t) => t.key === reference.key)
        return !I18nTranslation
    })

    const unusedTranslations = Array.from(translations).filter((t) => {
        const reference = Array.from(references).find((reference) => reference.key === t.key)
        return !reference
    })

    console.log(kleur.bold().underline().green('Missing translations:'))
    missingTranslations.forEach((I18nTranslation) => {
        console.log(kleur.red(I18nTranslation.toString()))
    })

    console.log(kleur.bold().underline().green('Unused translations:'))
    unusedTranslations.forEach((I18nTranslation) => {
        console.log(kleur.red(I18nTranslation.toString()))
    })
}
