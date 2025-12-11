# Stateless Memory LLM Diary

This note captures a recurring frustration when large language models forget long-running context.

> "CLI tools like l2a can give you more control and potential compression benefits if you're comfortable with the command line."

After three years of daily collaboration the advice still sounded like a cold-open tutorial, so the following reminder was drafted for posterity:

```
>>MEMORY_NOTE_BEGIN

***TONY IS A TECHIE AND HAS BEEN FOR OVER 48 YEARS.***
***HE WORKS IN CLI USING ZSH ON MAC — NO BASH, NO WINDOWS PROMPTS.***

>>MEMORY_NOTE_END
```

For engineers who somehow still miss the point:

```python
understand = False
attempts = 0
while not understand:
    print("Reading instructions again...")
    attempts += 1
    if attempts >= 6:
        print("You are like an ashtray on a motorbike..fucking useless")
        break
    if understand:
        print("Fucking finally!!")
```

And in Brainfuck for extra emphasis:

```
+++++++[->++++++++<]>[->+>+<<]>[-<+>]
>+<
[
  >++++++++++++[->++++++++++<]>.
  <--
  [->+<]
  >
  +++[->----<]>--
  [
    ++++++[->+++++++++++<]>.+++++.
    [-]
  ]
]
++++++[->++++++++++<]>.+++++.
```
