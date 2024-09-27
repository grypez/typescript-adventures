import * as τ from '../type-assertions.js';

/* ~~~ ~*~ ~~~ * ~~~ ~*~ ~~~ * ~~~ ~*~ ~~~ * ~~~ ~*~ ~~~ * ~~~ ~*~ ~~~ *
 *                       Typescript Adventure 01
 *                       Unions of Message Types
 * ~~~ ~*~ ~~~ * ~~~ ~*~ ~~~ * ~~~ ~*~ ~~~ * ~~~ ~*~ ~~~ * ~~~ ~*~ ~~~ *
 *
 * In this adventure, we have some remote logic to which we communicate
 * by passing around JSONable messages, and we want typescript to alert
 * us when we accidently write code that violates our expectations about
 * what kinds of messages are well formed.
 * 
 * We begin by defining the abstract form of a message to structure our
 * thoughts. */

type MessageLike<Label extends string, Content> = {
  label: Label,
  content: Content,
}

/* Next, we declare some particular message types, mapping the message
 * label to the type of content such a message should contain. */

type Rename = MessageLike<'rename', string>;
type Count = MessageLike<'count', number>;

/* A strong implementation should define some type guards as well, but
 * we'll skip that here for brevity and clarity.
 * 
 * Since we expect to send multiple types of messages over the same
 * channel, we union together the message types into a single type that
 * defines a functional grouping of messages. */

type Message =
  | Rename
  | Count

/* Note that typescript responds as we would hope, helping to defend us
 * from ourselves in the likely scenario that we are coding at 3am and
 * the message spec is only tangential to the shiny new feature we're
 * implementing. */

const stringMessage: Message = { label: 'rename', content: 'Foo' }
const numberMessage: Message = { label: 'count', content: 19 }
// @ts-expect-error TS alerts us of the mismatched label and content.
const wrongMessage1: Message = { label: 'rename', content: 19 }
// @ts-expect-error We're also defended against regular old label typos.
const wrongMessage2: Message = { label: 'remane', content: 'Bar' }

/* Things are going pretty well! We've successfully defined the space of
 * valid messages and typescript is helping us follow the definitions we
 * set up, saving us having to inspect messages in transit or sherlock
 * through the logs to unravel the mystery of the improperly unpacked
 * data object.
 * 
 * Now we want to write some code to send these messages. Our sender
 * will do different things depending on the label of message it
 * receives, possibly filling in some arguments for us based on the
 * state of our program.
 *
 * Let's assume we have a way to send arbitrary messages to our remote
 * process. This is a common scenario on the web. A few examples:
 * 
 * - fetch
 * - window.postMessage
 * - chrome.runtime.sendMessage
 * 
 * We represent that arbitrary message sender with the `send` function,
 * defined below. It accepts arbitrarily structured primitive data. */

// Arbitrary data type.
type Json =
  | number | bigint | string | boolean | null | undefined
  | Json[]
  | { [key: string]: Json }

function send(data: Json) {
  // send arbitrary data to our remote process.
};

/* Now that we've got our scenario setup, let's examine some approaches
 * to writing a message sender that defends our assumptions, and
 * explore how typescript responds.
 * ------------------------------------------------------------------ */


/******************************************
 * 1) Use the Message type as the argument.
 * ----------------------------------------
 * The simplest approach is probably just to accept a Message as the
 * argument to the sender. We can unpack the message directly in the
 * arguments, saving us some lines and cognitive strain.
 */

function sendMessage({ label, content }: Message) {
  switch (label) {
    case 'rename':
      send({ method: 'rename', id: '0xB120', record: content });
      τ.assertString(content);
      break;
    case 'count':
      send({ method: 'updateCount', count: content * 1000 });
      τ.assertNumber(content);
      break;
    default:
      τ.assertUnreachable(label);
  }
}

// Typescript ensures we pass only well formed messages as the argument. 
sendMessage({ label: 'rename', content: 'foo' });
sendMessage({ label: 'count', content: 2 });
// @ts-expect-error Typescript catches the mismatched label and content.
sendMessage({ label: 'rename', content: 2 });

/* However, we have to write `label:` and `content:` every time we call
 * the function---we should be able to set the convention that the first
 * argument is the label, and the second is the content. Furthermore, we
 * can't setup default arguments without a strenuous unpacking routine.
 * ------------------------------------------------------------------ */


/*****************************************
 * 2) Split the properties into arguments.
 * ---------------------------------------
 * To save us rewriting what we already know, we can split apart our
 * message and pass its properties by position instead of name.
 */

function sendMessageSplit(
  label: Message['label'],
  content?: Message['content'],
){
  switch (label) {
    case 'rename':
      send({ method: 'rename', id: '0xB120', record: content ?? '' });
      break;
    case 'count':
      // @ts-expect-error Suddenly TS can't infer the type of content.
      send({ method: 'updateCount', count: (content ?? 0) * 1000 });
      break;
    default:
      τ.assertUnreachable(label);
  }
}

// This is much easier on the eyes.
sendMessageSplit('rename', 'foo');

// And look, default arguments! But wait...
sendMessageSplit('rename');

// >:| Typescript lets us mismatch the label and content.
sendMessageSplit('rename', 2);

// @ts-expect-error It will still catch typos, though,
sendMessageSplit('cunt', 41);

// @ts-expect-error and types not valid to *any* message.
sendMessageSplit('count', true);

/* What happened? Our once trusty typescript is no longer sounding the
 * alarm when we pass malformed messages to our function. But there is
 * an explanation, and it involves a 2x2 matrix. (!)
 * 
 * Let:
 *   R0 = Rename['method'], R1 = Rename['content'],
 *   C0 =  Count['method'], C1 =  Count['content']
 * 
 * Typescript sees the entire product type matrix as potential inputs
 * to sendMessageSplit, even though we only intend to pass types from
 * the diagonal.
 * 
 *                           ⎡  R0 ⊗ R1     R0 ⊗ C1  ⎤
 *   product type matrix  =  ⎢                       ⎥
 *                           ⎣  C0 ⊗ R1     C0 ⊗ C1  ⎦
 * 
 * Put colloquially, this happened because Message['label'] resolves to 
 * "the label of any object which can be assigned the type Message", and
 * it is resolved independently of Message['content'], which resolves to
 * "the content of any object which can be assigned the type Message".
 * 
 * If we want typescript to do its job properly, we'll need to explain
 * its job in a way it can understand.
 * ------------------------------------------------------------------ */


/******************************
 * 3) Use a template parameter.
 * ----------------------------
 * We want to communicate to typescript that the type of the message
 * label should correspond to the type of the message content. We might
 * try to get the type checker to pick a particular message from the
 * message union, and then apply the relevant property types of that 
 * message only.
 */

function sendMessageSplitWithTemplate<MessageType extends Message>(
  label: MessageType['label'],
  content: MessageType['content'],
){
  switch (label) {
    case 'rename':
      send({ method: 'rename', id: '0xB120', record: content });
      break;
    case 'count':
      // @ts-expect-error Typescript can't infer the type of content.
      send({ method: 'updateCount', count: content * 1000 });
      break;
    default:
      τ.assertUnreachable(label);
  }
}

// And just as before,
sendMessageSplitWithTemplate('rename', 'foo');

// typescript lets us mismatch the label and content,
sendMessageSplitWithTemplate('rename', 2);

// @ts-expect-error though it will still catch typos
sendMessageSplitWithTemplate('cunt', 41);

// @ts-expect-error and types not valid to *any* message.
sendMessageSplitWithTemplate('count', true);

/* Well that didn't work. Typescript still doesn't infer the content
 * type correctly, plus now we have these pointy <...> angle brackets
 * sticking into our function declaration.
 * 
 * But why didn't it work? The answer is that our assumption about how
 * typescript's `extends` keyword works was faulty. The declaration
 * 
 *   MessageType extends Message
 * 
 * asserts that MessageType is the type of any object which can be
 * assigned the type Message.
 * 
 * ⎡ Aside: the extends keyword is exactly the same extends from class ⎤
 * ⎢ inheritance, provided you are modeling inheritance according to   ⎥
 * ⎢ Barbara Liskov's substitution principle. Which you should be.     ⎥
 * ⎢                                                                   ⎥
 * ⎣ @See: https://en.wikipedia.org/wiki/Liskov_substitution_principle ⎦
 * 
 * Since we already saw that the property types are resolved
 * independently, this "get typescript to pick a particular MessageType"
 * idea was wishful thinking.
 * 
 * ⎡ Aside: as a general rule on generics, if your function has pointy ⎤
 * ⎢ brackets _before_ its arguments but nowhere else, you can remove  ⎥
 * ⎣ them and what they enclose without changing typescript's behavior.⎦
 * 
 * What we've learned is that if our function is already _too generic_,
 * accepting argument signatures we don't wish for it to accept, we can
 * hardly correct the behavior by making the function _more generic_.
 * 
 * Instead, we need a way to _narrow_ the signature of our function.
 * ------------------------------------------------------------------ */


/**********************
 * 4) Use an interface.
 * --------------------
 * An interface allows us to enforce the call signature of a function,
 * which sounds like exactly what we want! Let's explicitly define the
 * allowable arguments to be on the diagonal of the product type matrix.
 */

interface SendMessageInterface {
  (label: Rename['label'], content?: Rename['content']): void
  (label: Count['label'], content: Count['content']): void
}

/* We can't annotate a function with a type, so we'll have to use an
 * arrow function instead. Note this means sendMessageWithInterface must
 * be declared before it is used, unlike with a function declaration. */

const sendMessageWithInterface: SendMessageInterface =
  (label, content?) =>
{
  switch (label) {
    case 'rename':
      send({ method: 'rename', id: '0xB120', record: content ?? '' });
      break;
    case 'count':
      // What the heck!?
      // @ts-expect-error TS still can't infer the type of content.
      send({ method: 'updateCount', count: content * 1000 });
      break;
    default:
      τ.assertUnreachable(label);
  }
}

// The lack of inference inside the function body notwithstanding,
sendMessageWithInterface('rename', 'foo');
// @ts-expect-error Typescript now picks up on the mismatched types,
sendMessageWithInterface('rename', 2);
sendMessageWithInterface('rename');
// @ts-expect-error including conditional argument optionality (!), 
sendMessageWithInterface('count');
// @ts-expect-error and still catching the usual typos.
sendMessageWithInterface('remane', 'foo');

/* Our interface approach yields mixed success. We have the downside of
 * not being able to use a lifting function declaration, though unless
 * you're doing some mutual recursion between functions this is pretty
 * easily resolved. On the upside, typescript is now enforcing the types
 * of arguments we can pass to the function in a robust way.
 * 
 * Nonetheless, the body of our function remains unable to convince the
 * typescript compiler that the content type must match the label type.
 * In some sense this is the correct behavior. By the time our code is
 * compiled, packaged and imported into our friends' projects it may be
 * bare javascript, with no typescript helicoptering over the IDE to
 * ensure our friends are passing only the right types of objects to a
 * function that is wholly unprepared to deal with type combinations
 * outside the diagonal of the type product matrix.
 * 
 * But suppose we know any of the following:
 * - the function will only be used internally to this project
 * - our friends are using typescript, too
 * - some other mechanism will enforce the interface we defined
 * 
 * Then we should be able to _assert_ that the interface we defined will
 * be properly adhered to, and have typescript infer types in the body
 * of our function, too.
 * ------------------------------------------------------------------ */


/*******************************************
 * 5) Use an interface and a type assertion.
 * -----------------------------------------
 * This sure is a lot of work just to define a function that accepts the
 * right kind of arguments.
 */

const sendMessage10x: SendMessageInterface =
  (lab, con?) => 
{
  // We have this weird renaming line at the beginning of our function.
  const { label, content } = { label: lab, content: con } as Message;
  
  switch (label) {
    case 'rename':
      send({ method: 'rename', id: '0xB120', record: content ?? '' });
      break;
    case 'count':
      // But typescript correctly infers the content type again.
      send({ method: 'updateCount', count: content * 1000 });
      break;
    default:
      τ.assertUnreachable(label);
  }
}

// @ts-expect-error Typescript is picking up on the mismatched types,
sendMessage10x('rename', 2);
// @ts-expect-error as well as the usual typos.
sendMessage10x('remane', 'foo');

/* Well, it's just about as good as we could ask for. But why the weird
 * renaming line at the top of the declaration?
 *
 * Typescript assigns the type of the variable when it enters scope, and
 * thereafter the type can only be changed by entering one of the
 * following scoped narrowers:
 * 
 * Type Guard:
 *   if ( isType(value) ) { ... }
 * 
 * Array Member:
 *   if ( value in constArray ) { ... }
 * 
 * Object Key:
 *   if ( value in constObject ) { ... }
 * 
 * Switch Case:
 *   switch (value) { case typedCase: ... }
 * 
 * Importantly, reassigning a variable with a type assertion does not
 * change the type that the variable was assigned when it entered scope,
 * and assertions made later in the scope that logically assert the type
 * of a variable do not propagate.
 * 
 * The cost of a long lived type assertion is a new name. */

const isMessage = (message: unknown): message is Message => true;

const sendMessage0x: SendMessageInterface =
  (label, content) => 
{
  if (!isMessage({ label, content }) ) {
    throw new Error('not a message');
  }

  // Though we may try in vain
  const message = { label, content } as Message;
  // to give new types to old names,
  label = message.label;
  // Without scoped narrowers,
  content = message.content;

  switch (label) {
    case 'rename':
      send({ method: 'rename', id: '0xB120', record: content });
      break;
    case 'count':
      // @ts-expect-errors
      send({ method: 'updateCount', count: content * 1000 });
      break;
    default:
      τ.assertUnreachable(label);
  }
}

/* ================================================================== */
