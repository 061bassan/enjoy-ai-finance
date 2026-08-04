import { describe, expect, it } from 'vitest'
import {
  ageOn,
  formatCpf,
  formatPhone,
  isValidCpf,
  passwordStrength,
  validateBirthDate,
  validateCpf,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} from './validators'

describe('CPF', () => {
  it('aceita CPFs com dígitos verificadores corretos', () => {
    // Gerados pelo algoritmo oficial — não são de pessoas reais.
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('11144477735')).toBe(true)
  })

  it('rejeita dígito verificador errado', () => {
    expect(isValidCpf('529.982.247-26')).toBe(false)
    expect(isValidCpf('11144477734')).toBe(false)
  })

  it('rejeita sequências de dígitos repetidos', () => {
    // Passam na conta dos verificadores, mas não existem.
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('00000000000')).toBe(false)
  })

  it('rejeita tamanho diferente de 11 dígitos', () => {
    expect(isValidCpf('5299822472')).toBe(false)
    expect(isValidCpf('529982247255')).toBe(false)
  })

  it('devolve mensagem específica para cada falha', () => {
    expect(validateCpf('')).toBe('Informe o CPF.')
    expect(validateCpf('123')).toBe('O CPF precisa ter 11 dígitos.')
    expect(validateCpf('11144477734')).toBe('Este CPF não é válido.')
    expect(validateCpf('111.444.777-35')).toBeNull()
  })

  it('formata progressivamente sem travar a digitação', () => {
    expect(formatCpf('529')).toBe('529')
    expect(formatCpf('529982')).toBe('529.982')
    expect(formatCpf('52998224725')).toBe('529.982.247-25')
    // Excesso é cortado em vez de rejeitado.
    expect(formatCpf('5299822472599')).toBe('529.982.247-25')
  })
})

describe('telefone', () => {
  it('aceita fixo e celular com DDD válido', () => {
    expect(validatePhone('(11) 3456-7890')).toBeNull()
    expect(validatePhone('11987654321')).toBeNull()
  })

  it('rejeita número sem DDD', () => {
    expect(validatePhone('987654321')).toBe(
      'O telefone precisa ter DDD + número (10 ou 11 dígitos).',
    )
  })

  it('rejeita DDD inexistente', () => {
    // 10, 23 e 63 — o 63 existe, os outros dois não.
    expect(validatePhone('1098765432')).toBe('DDD inválido.')
    expect(validatePhone('2398765432')).toBe('DDD inválido.')
  })

  it('exige o nono dígito começando com 9 em celular', () => {
    expect(validatePhone('11887654321')).toBe('Celular deve começar com 9 após o DDD.')
  })

  it('formata conforme o tamanho', () => {
    // Enquanto só há o DDD, não se fecha o parêntese: adiantar o ") " faria
    // o cursor pular à frente do que a pessoa ainda está digitando.
    expect(formatPhone('11')).toBe('(11')
    expect(formatPhone('113456')).toBe('(11) 3456')
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890')
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321')
  })
})

describe('e-mail', () => {
  it('aceita endereços comuns', () => {
    expect(validateEmail('maria@gmail.com')).toBeNull()
    expect(validateEmail('maria.silva+tag@empresa.com.br')).toBeNull()
  })

  it('rejeita o que claramente não é e-mail', () => {
    expect(validateEmail('maria')).toBe('E-mail inválido.')
    expect(validateEmail('maria@empresa')).toBe('E-mail inválido.')
    expect(validateEmail('maria @empresa.com')).toBe('E-mail inválido.')
    expect(validateEmail('')).toBe('Informe o e-mail.')
  })
})

describe('nome completo', () => {
  it('exige sobrenome', () => {
    expect(validateFullName('Maria')).toBe('Informe nome e sobrenome.')
    expect(validateFullName('Maria Silva')).toBeNull()
  })

  it('aceita acentos, apóstrofos e hífens', () => {
    expect(validateFullName("Antônio D'Ávila-Souza")).toBeNull()
    expect(validateFullName('José Gonçalves')).toBeNull()
  })

  it('rejeita números e símbolos', () => {
    expect(validateFullName('Maria Silva 123')).toBe('O nome tem caracteres inválidos.')
  })
})

describe('data de nascimento', () => {
  const hoje = '2026-08-03'

  it('calcula idade considerando se o aniversário já passou', () => {
    expect(ageOn('2000-08-03', hoje)).toBe(26)
    // Faz aniversário amanhã — ainda tem 25.
    expect(ageOn('2000-08-04', hoje)).toBe(25)
  })

  it('rejeita data no futuro', () => {
    expect(validateBirthDate('2027-01-01', hoje)).toBe(
      'A data de nascimento não pode ser no futuro.',
    )
  })

  it('exige idade mínima', () => {
    expect(validateBirthDate('2015-01-01', hoje)).toBe('É preciso ter pelo menos 16 anos.')
    expect(validateBirthDate('2010-01-01', hoje)).toBeNull()
  })

  it('rejeita idade improvável', () => {
    expect(validateBirthDate('1850-01-01', hoje)).toBe('Data de nascimento improvável.')
  })

  it('rejeita formato inválido', () => {
    expect(validateBirthDate('03/08/2000', hoje)).toBe('Data inválida.')
    expect(validateBirthDate('', hoje)).toBe('Informe a data de nascimento.')
  })
})

describe('senha', () => {
  it('exige comprimento, letra e número', () => {
    expect(validatePassword('abc12')).toBe('A senha precisa de pelo menos 8 caracteres.')
    expect(validatePassword('abcdefghij')).toBe('A senha precisa ter ao menos um número.')
    expect(validatePassword('1234567890')).toBe('A senha precisa ter ao menos uma letra.')
    expect(validatePassword('senha1234')).toBeNull()
  })

  it('classifica a força de forma crescente', () => {
    expect(passwordStrength('abc')).toBe('fraca')
    expect(passwordStrength('senha123')).toBe('média')
    expect(passwordStrength('Senha12345678')).toBe('forte')
  })

  it('nunca marca como fraca uma senha que a validação aceita', () => {
    // Contradição que o medidor não pode cometer: rejeitar de vermelho algo
    // que o sistema acabou de aprovar.
    for (const senha of ['senha123', 'abcdefg1', 'a1b2c3d4', '12345678a']) {
      expect(validatePassword(senha)).toBeNull()
      expect(passwordStrength(senha)).not.toBe('fraca')
    }
  })
})
